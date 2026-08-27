import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AdjustInclusionStockDto,
  CreateEventInclusionDto,
  CreateInclusionQuoteDto,
  FulfillInclusionDto,
  InclusionVariantInputDto,
  ReverseFulfillmentDto,
  UpdateEventInclusionDto,
  UpdateInclusionVariantDto,
} from './dto/optional-inclusion.dto';

type QuoteLine = {
  kind: 'admission' | 'inclusion' | 'fee' | 'discount';
  sourceId?: string;
  inclusionId?: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: string;
  total: string;
  attendeeIndex?: number;
  fulfillmentMethod?: 'pickup' | 'delivery' | 'digital' | 'manual';
  fulfillmentInstructions?: string | null;
};

type QuotePricingSnapshot = {
  version: 1;
  lines: QuoteLine[];
};

export type ConsumableInclusionQuote = {
  id: string;
  token: string;
  eventId: string;
  ticketTierId: string;
  attendeeCount: number;
  admissionSubtotal: Prisma.Decimal;
  inclusionSubtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  fees: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
  referralCode: string | null;
  expiresAt: Date;
  lines: QuoteLine[];
};

@Injectable()
export class OptionalInclusionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  isGloballyEnabled(): boolean {
    return this.config.get<boolean>('optionalInclusions.enabled') === true;
  }

  private assertGloballyEnabled() {
    if (!this.isGloballyEnabled()) {
      throw new NotFoundException('Optional inclusions are not available');
    }
  }

  private async assertEventEnabled(eventId: string) {
    this.assertGloballyEnabled();
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { optionalInclusionsEnabled: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!event.optionalInclusionsEnabled) {
      throw new NotFoundException('Optional inclusions are not enabled for this event');
    }
  }

  async setEventEnabled(eventId: string, enabled: boolean, actorId: string) {
    if (enabled) this.assertGloballyEnabled();
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.update({
        where: { id: eventId },
        data: { optionalInclusionsEnabled: enabled },
        select: { id: true, optionalInclusionsEnabled: true },
      });
      await this.audit.logWith(tx, {
        action: enabled ? 'OPTIONAL_INCLUSIONS_ENABLED' : 'OPTIONAL_INCLUSIONS_DISABLED',
        entityType: 'Event',
        entityId: eventId,
        performedById: actorId,
      });
      return event;
    });
  }

  async listOrganizer(eventId: string) {
    const items = await this.prisma.eventInclusion.findMany({
      where: { eventId },
      include: {
        variants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        eligibleTiers: { select: { ticketTierId: true, maxQuantityPerRegistration: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map((item) => ({
      ...item,
      eligibleTierIds: item.eligibleTiers.map((entry) => entry.ticketTierId),
      tierEligibility: item.eligibleTiers.map((entry) => ({
        tierId: entry.ticketTierId,
        maxQuantityPerRegistration: entry.maxQuantityPerRegistration,
      })),
      variants: item.variants.map((variant) => ({
        ...variant,
        price: Number(variant.price),
        availableQuantity: Math.max(
          0,
          variant.totalStock - variant.reservedStock - variant.soldStock,
        ),
      })),
    }));
  }

  async listPublic(eventId: string) {
    if (!this.isGloballyEnabled()) return [];
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { optionalInclusionsEnabled: true },
    });
    if (!event?.optionalInclusionsEnabled) return [];
    const now = new Date();
    const items = await this.prisma.eventInclusion.findMany({
      where: {
        eventId,
        status: 'active',
        AND: [
          { OR: [{ saleStartsAt: null }, { saleStartsAt: { lte: now } }] },
          { OR: [{ saleEndsAt: null }, { saleEndsAt: { gte: now } }] },
        ],
      },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        eligibleTiers: { select: { ticketTierId: true, maxQuantityPerRegistration: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      fulfillmentMethod: item.fulfillmentMethod,
      fulfillmentInstructions: item.fulfillmentInstructions,
      eligibleTierIds: item.eligibleTiers.map((entry) => entry.ticketTierId),
      tierEligibility: item.eligibleTiers.map((entry) => ({
        tierId: entry.ticketTierId,
        maxQuantityPerRegistration: entry.maxQuantityPerRegistration,
      })),
      maxPerRegistration:
        item.eligibleTiers.length === 1 ? item.eligibleTiers[0].maxQuantityPerRegistration : null,
      variants: item.variants.map((variant) => {
        const availableQuantity = Math.max(
          0,
          variant.totalStock - variant.reservedStock - variant.soldStock,
        );
        return {
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: Number(variant.price),
          currency: variant.currency,
          availableQuantity,
          isSoldOut: availableQuantity <= 0,
          isActive: variant.isActive,
        };
      }),
    }));
  }

  async create(eventId: string, dto: CreateEventInclusionDto, actorId: string) {
    this.validateSaleWindow(dto.saleStartsAt, dto.saleEndsAt);
    if (
      dto.status === 'active' &&
      !(dto.variants ?? []).some((variant) => variant.isActive !== false && variant.totalStock > 0)
    ) {
      throw new BadRequestException(
        'An active inclusion requires at least one active variant with stock',
      );
    }
    const tierEligibility = this.resolveTierEligibility(dto);
    await this.assertTierIdsBelongToEvent(
      eventId,
      tierEligibility.map((entry) => entry.ticketTierId),
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const inclusion = await tx.eventInclusion.create({
        data: {
          eventId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: dto.status ?? 'draft',
          saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null,
          saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null,
          fulfillmentMethod: dto.fulfillmentMethod ?? 'pickup',
          fulfillmentInstructions: dto.fulfillmentInstructions?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
          archivedAt: dto.status === 'archived' ? new Date() : null,
          variants: { create: (dto.variants ?? []).map((v) => this.variantCreateData(v)) },
          eligibleTiers: {
            create: tierEligibility,
          },
        },
        include: { variants: true, eligibleTiers: true },
      });
      await this.audit.logWith(tx, {
        action: 'EVENT_INCLUSION_CREATED',
        entityType: 'EventInclusion',
        entityId: inclusion.id,
        performedById: actorId,
        metadata: { eventId },
      });
      return inclusion;
    });
    return created;
  }

  async update(
    eventId: string,
    inclusionId: string,
    dto: UpdateEventInclusionDto,
    actorId: string,
  ) {
    const updatesTierEligibility =
      dto.tierEligibility !== undefined || dto.eligibleTierIds !== undefined;
    const tierEligibility = updatesTierEligibility ? this.resolveTierEligibility(dto) : [];
    if (updatesTierEligibility) {
      await this.assertTierIdsBelongToEvent(
        eventId,
        tierEligibility.map((entry) => entry.ticketTierId),
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockInclusionAndVariantsTx(tx, eventId, inclusionId);
      const existing = await tx.eventInclusion.findUniqueOrThrow({
        where: { id: inclusionId },
        select: { saleStartsAt: true, saleEndsAt: true },
      });
      this.validateSaleWindow(
        dto.saleStartsAt ?? existing.saleStartsAt?.toISOString(),
        dto.saleEndsAt ?? existing.saleEndsAt?.toISOString(),
      );
      if (updatesTierEligibility) {
        await tx.inclusionTierEligibility.deleteMany({ where: { inclusionId } });
        if (tierEligibility.length) {
          await tx.inclusionTierEligibility.createMany({
            data: tierEligibility.map((entry) => ({ inclusionId, ...entry })),
          });
        }
      }
      const updated = await tx.eventInclusion.update({
        where: { id: inclusionId },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.status !== undefined && {
            status: dto.status,
            archivedAt: dto.status === 'archived' ? new Date() : null,
          }),
          ...(dto.saleStartsAt !== undefined && {
            saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null,
          }),
          ...(dto.saleEndsAt !== undefined && {
            saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null,
          }),
          ...(dto.fulfillmentMethod !== undefined && { fulfillmentMethod: dto.fulfillmentMethod }),
          ...(dto.fulfillmentInstructions !== undefined && {
            fulfillmentInstructions: dto.fulfillmentInstructions?.trim() || null,
          }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
        include: { variants: true, eligibleTiers: true },
      });
      await this.assertActiveInclusionHasViableVariantTx(tx, inclusionId);
      await this.audit.logWith(tx, {
        action: 'EVENT_INCLUSION_UPDATED',
        entityType: 'EventInclusion',
        entityId: inclusionId,
        performedById: actorId,
        metadata: { eventId },
      });
      return updated;
    });
  }

  async createVariant(
    eventId: string,
    inclusionId: string,
    dto: InclusionVariantInputDto,
    actorId: string,
  ) {
    await this.requireInclusion(eventId, inclusionId);
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.inclusionVariant.create({
        data: { inclusionId, ...this.variantCreateData(dto) },
      });
      await this.audit.logWith(tx, {
        action: 'INCLUSION_VARIANT_CREATED',
        entityType: 'InclusionVariant',
        entityId: variant.id,
        performedById: actorId,
        metadata: { eventId, inclusionId },
      });
      return variant;
    });
  }

  async updateVariant(
    eventId: string,
    inclusionId: string,
    variantId: string,
    dto: UpdateInclusionVariantDto,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockInclusionAndVariantsTx(tx, eventId, inclusionId);
      const variant = await tx.inclusionVariant.findFirst({
        where: { id: variantId, inclusionId },
        select: { id: true },
      });
      if (!variant) throw new NotFoundException('Inclusion variant not found');
      const updated = await tx.inclusionVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.sku !== undefined && { sku: dto.sku?.trim() || null }),
          ...(dto.price !== undefined && { price: new Prisma.Decimal(dto.price) }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          version: { increment: 1 },
        },
      });
      await this.assertActiveInclusionHasViableVariantTx(tx, inclusionId);
      await this.audit.logWith(tx, {
        action: 'INCLUSION_VARIANT_UPDATED',
        entityType: 'InclusionVariant',
        entityId: variantId,
        performedById: actorId,
        metadata: { eventId, inclusionId },
      });
      return updated;
    });
  }

  async adjustStock(
    eventId: string,
    inclusionId: string,
    variantId: string,
    dto: AdjustInclusionStockDto,
    actorId: string,
  ) {
    if (dto.quantityDelta === 0) throw new BadRequestException('Stock adjustment cannot be zero');
    return this.prisma.$transaction(async (tx) => {
      await this.lockInclusionAndVariantsTx(tx, eventId, inclusionId);
      const current = await tx.inclusionVariant.findFirst({
        where: { id: variantId, inclusionId },
      });
      if (!current) throw new NotFoundException('Inclusion variant not found');
      const nextTotal = current.totalStock + dto.quantityDelta;
      if (nextTotal < current.reservedStock + current.soldStock) {
        throw new ConflictException('Stock cannot be reduced below reserved plus sold quantity');
      }
      const updated = await tx.inclusionVariant.update({
        where: { id: variantId },
        data: { totalStock: nextTotal, version: { increment: 1 } },
      });
      await this.assertActiveInclusionHasViableVariantTx(tx, inclusionId);
      await tx.inclusionInventoryMovement.create({
        data: {
          variantId,
          type: 'adjust',
          quantity: dto.quantityDelta,
          reason: dto.reason.trim(),
          actorId,
        },
      });
      await this.audit.logWith(tx, {
        action: 'INCLUSION_STOCK_ADJUSTED',
        entityType: 'InclusionVariant',
        entityId: variantId,
        performedById: actorId,
        metadata: { eventId, quantityDelta: dto.quantityDelta, reason: dto.reason },
      });
      return { ...updated, availableStock: nextTotal - updated.reservedStock - updated.soldStock };
    });
  }

  async createQuote(eventId: string, dto: CreateInclusionQuoteDto, userId?: string) {
    await this.assertEventEnabled(eventId);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        isFree: true,
        platformFee: true,
        maxPerUser: true,
        tiers: { where: { id: dto.tierId }, take: 1 },
      },
    });
    const tier = event?.tiers[0];
    if (!event || !tier) throw new NotFoundException('Ticket tier not found');
    if (!['published', 'on_sale'].includes(event.status)) {
      throw new BadRequestException('Event is not open for registration');
    }
    if (dto.attendeeCount > tier.maxPerOrder)
      throw new BadRequestException(`Maximum ${tier.maxPerOrder} attendees for this tier`);

    const normalized = this.normalizeSelections(dto.selections);
    const variantIds = [...new Set(normalized.map((selection) => selection.variantId))];
    const variants = await this.prisma.inclusionVariant.findMany({
      where: { id: { in: variantIds }, inclusion: { eventId, status: 'active' }, isActive: true },
      include: { inclusion: { include: { eligibleTiers: true } } },
    });
    if (variants.length !== variantIds.length)
      throw new BadRequestException('One or more add-ons are unavailable');
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const now = new Date();
    const lines: QuoteLine[] = [];
    const admissionUnit = event.isFree ? new Prisma.Decimal(0) : tier.price;
    const admissionSubtotal = admissionUnit.mul(dto.attendeeCount).toDecimalPlaces(2);
    lines.push({
      kind: 'admission',
      sourceId: tier.id,
      name: tier.name,
      quantity: dto.attendeeCount,
      unitPrice: admissionUnit.toFixed(2),
      total: admissionSubtotal.toFixed(2),
    });

    let inclusionSubtotal = new Prisma.Decimal(0);
    const totalRequestedByVariant = new Map<string, number>();
    const totalRequestedByInclusion = new Map<string, number>();
    for (const selection of normalized) {
      if (selection.attendeeIndex !== undefined && selection.attendeeIndex >= dto.attendeeCount) {
        throw new BadRequestException('Add-on attendee assignment is outside this registration');
      }
      const variant = byId.get(selection.variantId)!;
      const inclusion = variant.inclusion;
      if (selection.inclusionId !== inclusion.id)
        throw new BadRequestException('Add-on selection does not match its variant');
      if (inclusion.saleStartsAt && inclusion.saleStartsAt > now)
        throw new BadRequestException(`${inclusion.name} is not on sale yet`);
      if (inclusion.saleEndsAt && inclusion.saleEndsAt < now)
        throw new BadRequestException(`${inclusion.name} is no longer on sale`);
      const eligibility = inclusion.eligibleTiers.find(
        (entry) => entry.ticketTierId === dto.tierId,
      );
      if (inclusion.eligibleTiers.length > 0 && !eligibility)
        throw new BadRequestException(`${inclusion.name} is not available for this ticket tier`);
      totalRequestedByVariant.set(
        variant.id,
        (totalRequestedByVariant.get(variant.id) ?? 0) + selection.quantity,
      );
      totalRequestedByInclusion.set(
        inclusion.id,
        (totalRequestedByInclusion.get(inclusion.id) ?? 0) + selection.quantity,
      );
      const lineTotal = variant.price.mul(selection.quantity).toDecimalPlaces(2);
      inclusionSubtotal = inclusionSubtotal.add(lineTotal);
      lines.push({
        kind: 'inclusion',
        sourceId: variant.id,
        inclusionId: inclusion.id,
        name: inclusion.name,
        variantName: variant.name,
        quantity: selection.quantity,
        unitPrice: variant.price.toFixed(2),
        total: lineTotal.toFixed(2),
        attendeeIndex: selection.attendeeIndex,
        fulfillmentMethod: inclusion.fulfillmentMethod,
        fulfillmentInstructions: inclusion.fulfillmentInstructions,
      });
    }
    for (const variant of variants) {
      const eligibility = variant.inclusion.eligibleTiers.find(
        (entry) => entry.ticketTierId === dto.tierId,
      );
      const requested = totalRequestedByInclusion.get(variant.inclusion.id) ?? 0;
      if (
        eligibility?.maxQuantityPerRegistration &&
        requested > eligibility.maxQuantityPerRegistration
      ) {
        throw new BadRequestException(
          `Maximum ${eligibility.maxQuantityPerRegistration} unit(s) of ${variant.inclusion.name} per registration`,
        );
      }
    }
    for (const [variantId, requested] of totalRequestedByVariant) {
      const variant = byId.get(variantId)!;
      const available = variant.totalStock - variant.reservedStock - variant.soldStock;
      if (available < requested)
        throw new ConflictException(
          `Only ${Math.max(0, available)} unit(s) of ${variant.inclusion.name} - ${variant.name} remain`,
        );
    }

    const referral = dto.referralCode?.trim().toUpperCase() || null;
    const discount = referral
      ? await this.calculateAdmissionReferralDiscount(
          eventId,
          dto.tierId,
          referral,
          admissionSubtotal,
        )
      : new Prisma.Decimal(0);
    if (discount.gt(0))
      lines.push({
        kind: 'discount',
        name: `Referral ${referral}`,
        quantity: 1,
        unitPrice: discount.neg().toFixed(2),
        total: discount.neg().toFixed(2),
      });
    const payableBeforeFee = admissionSubtotal.sub(discount).add(inclusionSubtotal);
    const defaultFreeAdmissionAddOnFee = new Prisma.Decimal(
      this.config.get<number>('optionalInclusions.defaultPlatformFee') ?? 50,
    );
    const configuredFee = event.platformFee.gt(0)
      ? event.platformFee
      : event.isFree && inclusionSubtotal.gt(0)
        ? defaultFreeAdmissionAddOnFee
        : new Prisma.Decimal(0);
    const fees = payableBeforeFee.gt(0) ? configuredFee.toDecimalPlaces(2) : new Prisma.Decimal(0);
    if (fees.gt(0))
      lines.push({
        kind: 'fee',
        name: 'Platform fee',
        quantity: 1,
        unitPrice: fees.toFixed(2),
        total: fees.toFixed(2),
      });
    const total = payableBeforeFee.add(fees).toDecimalPlaces(2);
    const ttlMinutes = this.config.get<number>('optionalInclusions.quoteTtlMinutes') ?? 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const quote = await this.prisma.checkoutQuote.create({
      data: {
        eventId,
        ticketTierId: dto.tierId,
        userId: userId ?? null,
        attendeeCount: dto.attendeeCount,
        admissionSubtotal,
        inclusionSubtotal,
        discount,
        fees,
        total,
        currency: tier.currency,
        referralCode: referral,
        pricingSnapshot: { version: 1, lines } as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    return {
      token: quote.token,
      expiresAt: quote.expiresAt.toISOString(),
      lineItems: lines.map((line) => ({
        ...line,
        unitPrice: Number(line.unitPrice),
        total: Number(line.total),
      })),
      admissionSubtotal: Number(admissionSubtotal),
      inclusionSubtotal: Number(inclusionSubtotal),
      discount: Number(discount),
      fees: Number(fees),
      total: Number(total),
      currency: tier.currency,
    };
  }

  async getConsumableQuote(
    token: string,
    userId: string,
    eventId: string,
    tierId: string,
    attendeeCount: number,
  ): Promise<ConsumableInclusionQuote> {
    await this.assertEventEnabled(eventId);
    const quote = await this.prisma.checkoutQuote.findUnique({ where: { token } });
    return this.validateConsumableQuote(quote, userId, eventId, tierId, attendeeCount);
  }

  async consumeQuoteTx(
    tx: Prisma.TransactionClient,
    token: string,
    userId: string,
    registrationId: string,
    eventId: string,
    tierId: string,
    attendeeIds: string[],
  ) {
    // Lock order for checkout is event feature switch -> quote -> variants (sorted by id).
    // A shared event lock keeps concurrent checkouts concurrent while making a disable wait.
    await this.assertEventEnabledTx(tx, eventId);
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM checkout_quotes WHERE token = ${token} FOR UPDATE
    `;
    if (!locked[0]) throw new NotFoundException('Checkout quote not found');
    const rawQuote = await tx.checkoutQuote.findUnique({ where: { id: locked[0].id } });
    const quote = this.validateConsumableQuote(
      rawQuote,
      userId,
      eventId,
      tierId,
      attendeeIds.length,
    );
    const inclusionLines = quote.lines.filter((line) => line.kind === 'inclusion');
    const requestedByVariant = new Map<string, number>();
    const requestedByInclusion = new Map<string, number>();
    for (const line of inclusionLines)
      requestedByVariant.set(
        line.sourceId!,
        (requestedByVariant.get(line.sourceId!) ?? 0) + line.quantity,
      );
    for (const line of inclusionLines) {
      if (line.inclusionId) {
        requestedByInclusion.set(
          line.inclusionId,
          (requestedByInclusion.get(line.inclusionId) ?? 0) + line.quantity,
        );
      }
    }
    for (const variantId of [...requestedByVariant.keys()].sort()) {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM inclusion_variants WHERE id = ${variantId} FOR UPDATE`;
      if (!rows[0]) throw new ConflictException('An add-on variant is no longer available');
      const variant = await tx.inclusionVariant.findUniqueOrThrow({
        where: { id: variantId },
        include: { inclusion: { include: { eligibleTiers: true } } },
      });
      const requested = requestedByVariant.get(variantId)!;
      const now = new Date();
      const quotedLines = inclusionLines.filter((line) => line.sourceId === variantId);
      const quotedUnitPrice = quotedLines[0]?.unitPrice;
      const eligible =
        variant.inclusion.eligibleTiers.length === 0 ||
        variant.inclusion.eligibleTiers.some((entry) => entry.ticketTierId === tierId);
      const eligibility = variant.inclusion.eligibleTiers.find(
        (entry) => entry.ticketTierId === tierId,
      );
      const exceedsRegistrationMaximum = Boolean(
        eligibility?.maxQuantityPerRegistration &&
        (requestedByInclusion.get(variant.inclusion.id) ?? 0) >
          eligibility.maxQuantityPerRegistration,
      );
      if (
        !variant.isActive ||
        variant.inclusion.status !== 'active' ||
        (variant.inclusion.saleStartsAt && variant.inclusion.saleStartsAt > now) ||
        (variant.inclusion.saleEndsAt && variant.inclusion.saleEndsAt < now) ||
        !eligible ||
        exceedsRegistrationMaximum ||
        quotedUnitPrice === undefined ||
        !variant.price.eq(new Prisma.Decimal(quotedUnitPrice)) ||
        variant.totalStock - variant.reservedStock - variant.soldStock < requested
      ) {
        throw new ConflictException('An add-on became unavailable; request a new quote');
      }
    }

    for (const line of quote.lines) {
      const attendeeId = line.attendeeIndex === undefined ? null : attendeeIds[line.attendeeIndex];
      const lineItem = await tx.registrationLineItem.create({
        data: {
          registrationId,
          kind: line.kind,
          sourceId: line.sourceId ?? null,
          nameSnapshot: line.name,
          variantSnapshot: line.variantName ?? null,
          assignedAttendeeId: attendeeId,
          quantity: line.quantity,
          unitPrice: new Prisma.Decimal(line.unitPrice),
          total: new Prisma.Decimal(line.total),
          fulfillmentMethodSnapshot: line.fulfillmentMethod ?? null,
          fulfillmentInstructionsSnapshot: line.fulfillmentInstructions ?? null,
        },
      });
      if (line.kind !== 'inclusion' || !line.sourceId) continue;
      const expiresAt = new Date(
        Date.now() +
          (this.config.get<number>('optionalInclusions.paymentHoldMinutes') ?? 120) * 60_000,
      );
      const reservation = await tx.inclusionInventoryReservation.create({
        data: {
          registrationId,
          quoteId: quote.id,
          lineItemId: lineItem.id,
          variantId: line.sourceId,
          quantity: line.quantity,
          expiresAt,
          idempotencyKey: `registration:${registrationId}:line:${lineItem.id}`,
        },
      });
      await tx.inclusionVariant.update({
        where: { id: line.sourceId },
        data: { reservedStock: { increment: line.quantity }, version: { increment: 1 } },
      });
      await tx.inclusionInventoryMovement.create({
        data: {
          variantId: line.sourceId,
          reservationId: reservation.id,
          type: 'reserve',
          quantity: line.quantity,
          reason: 'Registration created',
        },
      });
      await tx.inclusionFulfillment.create({
        data: { lineItemId: lineItem.id, quantity: line.quantity },
      });
    }
    await tx.checkoutQuote.update({
      where: { id: quote.id },
      data: { status: 'consumed', registrationId, consumedAt: new Date() },
    });
    return quote;
  }

  async confirmRegistrationReservationsTx(
    tx: Prisma.TransactionClient,
    registrationId: string,
    actorId: string,
  ) {
    const reservations = await tx.inclusionInventoryReservation.findMany({
      where: { registrationId, status: 'reserved' },
    });
    if (reservations.some((reservation) => reservation.expiresAt <= new Date())) {
      throw new ConflictException(
        'Add-on inventory hold expired; this registration can no longer be approved',
      );
    }
    for (const reservation of reservations) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM inclusion_variants WHERE id = ${reservation.variantId} FOR UPDATE`);
      await tx.inclusionVariant.update({
        where: { id: reservation.variantId },
        data: {
          reservedStock: { decrement: reservation.quantity },
          soldStock: { increment: reservation.quantity },
          version: { increment: 1 },
        },
      });
      await tx.inclusionInventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'confirmed', confirmedAt: new Date(), rejectionGraceUntil: null },
      });
      await tx.inclusionInventoryMovement.create({
        data: {
          variantId: reservation.variantId,
          reservationId: reservation.id,
          type: 'confirm',
          quantity: reservation.quantity,
          actorId,
          reason: 'Registration approved',
        },
      });
    }
  }

  async markProofRejectedGraceTx(tx: Prisma.TransactionClient, registrationId: string) {
    const graceHours = this.config.get<number>('optionalInclusions.rejectionGraceHours') ?? 24;
    const graceUntil = new Date(Date.now() + graceHours * 3_600_000);
    await tx.inclusionInventoryReservation.updateMany({
      where: { registrationId, status: 'reserved' },
      data: { rejectionGraceUntil: graceUntil, expiresAt: graceUntil },
    });
  }

  async markProofSubmittedReviewTx(tx: Prisma.TransactionClient, registrationId: string) {
    const reviewHours = this.config.get<number>('optionalInclusions.reviewHoldHours') ?? 168;
    await tx.inclusionInventoryReservation.updateMany({
      where: { registrationId, status: 'reserved' },
      data: {
        rejectionGraceUntil: null,
        expiresAt: new Date(Date.now() + reviewHours * 3_600_000),
      },
    });
  }

  async assertReservationsCanResubmit(registrationId: string) {
    return this.assertReservationsCanResubmitWith(this.prisma, registrationId);
  }

  async assertReservationsCanResubmitTx(tx: Prisma.TransactionClient, registrationId: string) {
    return this.assertReservationsCanResubmitWith(tx, registrationId);
  }

  private async assertReservationsCanResubmitWith(
    db: Pick<Prisma.TransactionClient, 'inclusionInventoryReservation'>,
    registrationId: string,
  ) {
    const expired = await db.inclusionInventoryReservation.count({
      where: {
        registrationId,
        OR: [
          { status: { in: ['released', 'expired'] } },
          { status: 'reserved', expiresAt: { lte: new Date() } },
        ],
      },
    });
    if (expired > 0)
      throw new ConflictException(
        'Add-on inventory hold expired; cancel this registration and request a new quote',
      );
  }

  async releaseRegistrationReservationsTx(
    tx: Prisma.TransactionClient,
    registrationId: string,
    reason: string,
    movementType: 'release' | 'expire' = 'release',
    actorId?: string,
  ) {
    const reservations = await tx.inclusionInventoryReservation.findMany({
      where: { registrationId, status: 'reserved' },
    });
    for (const reservation of reservations) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM inclusion_variants WHERE id = ${reservation.variantId} FOR UPDATE`);
      await tx.inclusionVariant.update({
        where: { id: reservation.variantId },
        data: { reservedStock: { decrement: reservation.quantity }, version: { increment: 1 } },
      });
      await tx.inclusionInventoryReservation.update({
        where: { id: reservation.id },
        data: {
          status: movementType === 'expire' ? 'expired' : 'released',
          releasedAt: new Date(),
          rejectionGraceUntil: null,
        },
      });
      await tx.inclusionInventoryMovement.create({
        data: {
          variantId: reservation.variantId,
          reservationId: reservation.id,
          type: movementType,
          quantity: reservation.quantity,
          actorId,
          reason,
        },
      });
    }
  }

  async expireDueReservations(): Promise<number> {
    const now = new Date();
    await this.prisma.checkoutQuote.updateMany({
      where: { status: 'active', expiresAt: { lte: now } },
      data: { status: 'expired' },
    });
    const registrations = await this.prisma.inclusionInventoryReservation.findMany({
      where: {
        status: 'reserved',
        OR: [{ expiresAt: { lte: now } }, { rejectionGraceUntil: { lte: now } }],
      },
      distinct: ['registrationId'],
      select: { registrationId: true },
    });
    for (const { registrationId } of registrations) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM registrations WHERE id = ${registrationId} FOR UPDATE`);
        const registration = await tx.registration.findUnique({
          where: { id: registrationId },
          select: { id: true, status: true, tierId: true, attendeeCount: true },
        });
        if (!registration) return;
        await this.releaseRegistrationReservationsTx(
          tx,
          registrationId,
          'Inventory hold expired',
          'expire',
        );
        if (
          !['pending_payment', 'proof_submitted', 'pending_approval', 'rejected'].includes(
            registration.status,
          )
        ) {
          return;
        }
        if (registration.tierId) {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM ticket_tiers WHERE id = ${registration.tierId} FOR UPDATE`);
          const tier = await tx.ticketTier.findUnique({
            where: { id: registration.tierId },
            select: { soldQuantity: true },
          });
          if (tier) {
            await tx.ticketTier.update({
              where: { id: registration.tierId },
              data: { soldQuantity: Math.max(0, tier.soldQuantity - registration.attendeeCount) },
            });
          }
        }
        await tx.registration.update({
          where: { id: registrationId },
          data: { status: 'cancelled', rejectionReason: 'Optional add-on inventory hold expired' },
        });
        await this.audit.logWith(tx, {
          action: 'INCLUSION_RESERVATION_EXPIRED',
          entityType: 'Registration',
          entityId: registrationId,
          registrationId,
          metadata: { previousStatus: registration.status },
        });
      });
    }
    return registrations.length;
  }

  async listFulfillments(
    eventId: string,
    status?: string,
    variantId?: string,
    page = 1,
    limit = 50,
  ) {
    if (status && !['pending', 'fulfilled', 'reversed', 'cancelled'].includes(status)) {
      throw new BadRequestException('Invalid fulfillment status');
    }
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const where: Prisma.InclusionFulfillmentWhereInput = {
      lineItem: {
        registration: { eventId, status: 'verified' },
        ...(variantId ? { sourceId: variantId } : {}),
      },
      ...(status ? { status: status as Prisma.EnumInclusionFulfillmentStatusFilter } : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.inclusionFulfillment.count({ where }),
      this.prisma.inclusionFulfillment.findMany({
        where,
        skip: (Math.max(page, 1) - 1) * safeLimit,
        take: safeLimit,
        orderBy: { createdAt: 'asc' },
        include: {
          lineItem: {
            include: {
              attendee: true,
              registration: {
                select: {
                  id: true,
                  referenceNumber: true,
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      data: data.map((item) => ({
        id: item.id,
        lineItemId: item.lineItemId,
        registrationId: item.lineItem.registration.id,
        referenceNumber: item.lineItem.registration.referenceNumber,
        customerName:
          [item.lineItem.registration.user?.firstName, item.lineItem.registration.user?.lastName]
            .filter(Boolean)
            .join(' ') || null,
        attendeeName: item.lineItem.attendee
          ? `${item.lineItem.attendee.firstName} ${item.lineItem.attendee.lastName}`
          : null,
        inclusionName: item.lineItem.nameSnapshot,
        variantName: item.lineItem.variantSnapshot ?? '',
        quantity: item.quantity,
        status: item.status,
        fulfilledAt: item.fulfilledAt?.toISOString() ?? null,
        fulfilledBy: item.fulfilledById,
      })),
      meta: {
        total,
        page: Math.max(page, 1),
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async fulfill(eventId: string, lineItemId: string, dto: FulfillInclusionDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM inclusion_fulfillments WHERE line_item_id = ${lineItemId} FOR UPDATE
      `;
      if (!locked[0]) throw new NotFoundException('Fulfillable inclusion line not found');
      const line = await tx.registrationLineItem.findFirst({
        where: { id: lineItemId, kind: 'inclusion', registration: { eventId, status: 'verified' } },
        include: { fulfillments: true },
      });
      if (!line) throw new NotFoundException('Fulfillable inclusion line not found');
      if (dto.quantity !== line.quantity) {
        throw new BadRequestException(
          'Optional Inclusions v1 requires the purchased line to be fulfilled in full',
        );
      }
      const fulfillmentRecord = line.fulfillments[0];
      if (
        !fulfillmentRecord ||
        fulfillmentRecord.status === 'fulfilled' ||
        fulfillmentRecord.status === 'cancelled'
      ) {
        throw new ConflictException('This inclusion line is not available for fulfillment');
      }
      const fulfillment = await tx.inclusionFulfillment.update({
        where: { id: fulfillmentRecord.id },
        data: {
          quantity: dto.quantity,
          status: 'fulfilled',
          fulfilledById: actorId,
          fulfilledAt: new Date(),
          reversedById: null,
          reversedAt: null,
          reversalReason: null,
        },
      });
      if (line.sourceId)
        await tx.inclusionInventoryMovement.create({
          data: {
            variantId: line.sourceId,
            type: 'fulfill',
            quantity: dto.quantity,
            actorId,
            reason: 'Inclusion fulfilled',
            metadata: { lineItemId, fulfillmentId: fulfillment.id },
          },
        });
      await this.audit.logWith(tx, {
        action: 'INCLUSION_FULFILLED',
        entityType: 'InclusionFulfillment',
        entityId: fulfillment.id,
        registrationId: line.registrationId,
        performedById: actorId,
        metadata: { lineItemId, quantity: dto.quantity },
      });
      return fulfillment;
    });
  }

  async reverseFulfillment(
    eventId: string,
    fulfillmentId: string,
    dto: ReverseFulfillmentDto,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM inclusion_fulfillments WHERE id = ${fulfillmentId} FOR UPDATE
      `;
      if (!locked[0]) throw new NotFoundException('Active fulfillment not found');
      const fulfillment = await tx.inclusionFulfillment.findFirst({
        where: { id: fulfillmentId, status: 'fulfilled', lineItem: { registration: { eventId } } },
        include: { lineItem: true },
      });
      if (!fulfillment) throw new NotFoundException('Active fulfillment not found');
      const reversed = await tx.inclusionFulfillment.update({
        where: { id: fulfillmentId },
        data: {
          status: 'reversed',
          reversedById: actorId,
          reversedAt: new Date(),
          reversalReason: dto.reason.trim(),
        },
      });
      if (fulfillment.lineItem.sourceId)
        await tx.inclusionInventoryMovement.create({
          data: {
            variantId: fulfillment.lineItem.sourceId,
            type: 'reverse',
            quantity: fulfillment.quantity,
            actorId,
            reason: dto.reason.trim(),
            metadata: { fulfillmentId },
          },
        });
      await this.audit.logWith(tx, {
        action: 'INCLUSION_FULFILLMENT_REVERSED',
        entityType: 'InclusionFulfillment',
        entityId: fulfillmentId,
        registrationId: fulfillment.lineItem.registrationId,
        performedById: actorId,
        metadata: { reason: dto.reason },
      });
      return reversed;
    });
  }

  async report(eventId: string) {
    const [lines, variants, registrations] = await Promise.all([
      this.prisma.registrationLineItem.findMany({
        where: { kind: 'inclusion', registration: { eventId, status: 'verified' } },
        include: { fulfillments: true },
      }),
      this.prisma.inclusionVariant.findMany({
        where: { inclusion: { eventId } },
        include: { inclusion: { select: { id: true, name: true } } },
      }),
      this.prisma.registration.count({ where: { eventId, status: 'verified' } }),
    ]);
    const inclusionRevenue = lines.reduce(
      (sum, line) => sum.add(line.total),
      new Prisma.Decimal(0),
    );
    const unitsSold = lines.reduce((sum, line) => sum + line.quantity, 0);
    const unitsFulfilled = lines.reduce(
      (sum, line) =>
        sum +
        line.fulfillments
          .filter((item) => item.status === 'fulfilled')
          .reduce((part, item) => part + item.quantity, 0),
      0,
    );
    const registrationsWithInclusions = new Set(lines.map((line) => line.registrationId)).size;
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const byVariantMap = new Map<
      string,
      {
        inclusionId: string;
        inclusionName: string;
        variantId: string;
        variantName: string;
        unitsSold: number;
        revenue: Prisma.Decimal;
        unitsFulfilled: number;
      }
    >();
    for (const line of lines) {
      if (!line.sourceId) continue;
      const variant = variantById.get(line.sourceId);
      if (!variant) continue;
      const fulfilled = line.fulfillments
        .filter((item) => item.status === 'fulfilled')
        .reduce((sum, item) => sum + item.quantity, 0);
      const current = byVariantMap.get(variant.id) ?? {
        inclusionId: variant.inclusion.id,
        inclusionName: variant.inclusion.name,
        variantId: variant.id,
        variantName: variant.name,
        unitsSold: 0,
        revenue: new Prisma.Decimal(0),
        unitsFulfilled: 0,
      };
      current.unitsSold += line.quantity;
      current.revenue = current.revenue.add(line.total);
      current.unitsFulfilled += fulfilled;
      byVariantMap.set(variant.id, current);
    }
    const byVariant = [...byVariantMap.values()].map((row) => ({
      ...row,
      revenue: Number(row.revenue),
      unitsUnfulfilled: Math.max(0, row.unitsSold - row.unitsFulfilled),
    }));
    const byInclusionMap = new Map<
      string,
      {
        inclusionId: string;
        inclusionName: string;
        unitsSold: number;
        revenue: number;
        unitsFulfilled: number;
        unitsUnfulfilled: number;
      }
    >();
    for (const row of byVariant) {
      const current = byInclusionMap.get(row.inclusionId) ?? {
        inclusionId: row.inclusionId,
        inclusionName: row.inclusionName,
        unitsSold: 0,
        revenue: 0,
        unitsFulfilled: 0,
        unitsUnfulfilled: 0,
      };
      current.unitsSold += row.unitsSold;
      current.revenue += row.revenue;
      current.unitsFulfilled += row.unitsFulfilled;
      current.unitsUnfulfilled += row.unitsUnfulfilled;
      byInclusionMap.set(row.inclusionId, current);
    }
    const summary = {
      inclusionRevenue: Number(inclusionRevenue),
      unitsSold,
      unitsFulfilled,
      unitsUnfulfilled: Math.max(0, unitsSold - unitsFulfilled),
      attachmentRate: registrations === 0 ? 0 : (registrationsWithInclusions / registrations) * 100,
    };
    return {
      summary,
      byInclusion: [...byInclusionMap.values()],
      byVariant,
      inventory: variants.map((variant) => ({
        inclusionId: variant.inclusion.id,
        inclusionName: variant.inclusion.name,
        variantId: variant.id,
        variantName: variant.name,
        totalStock: variant.totalStock,
        reservedStock: variant.reservedStock,
        soldStock: variant.soldStock,
        availableStock: variant.totalStock - variant.reservedStock - variant.soldStock,
      })),
    };
  }

  private async lockInclusionAndVariantsTx(
    tx: Prisma.TransactionClient,
    eventId: string,
    inclusionId: string,
  ): Promise<void> {
    const inclusionRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM event_inclusions
      WHERE id = ${inclusionId} AND event_id = ${eventId}
      FOR UPDATE
    `);
    if (!inclusionRows[0]) throw new NotFoundException('Optional inclusion not found');

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM inclusion_variants
      WHERE inclusion_id = ${inclusionId}
      ORDER BY id
      FOR UPDATE
    `);
  }

  private async assertActiveInclusionHasViableVariantTx(
    tx: Prisma.TransactionClient,
    inclusionId: string,
  ): Promise<void> {
    const inclusion = await tx.eventInclusion.findUnique({
      where: { id: inclusionId },
      select: { status: true },
    });
    if (inclusion?.status !== 'active') return;

    const viableVariantCount = await tx.inclusionVariant.count({
      where: { inclusionId, isActive: true, totalStock: { gt: 0 } },
    });
    if (viableVariantCount === 0) {
      throw new BadRequestException(
        'An active inclusion requires at least one active variant with stock',
      );
    }
  }

  private async assertEventEnabledTx(
    tx: Prisma.TransactionClient,
    eventId: string,
  ): Promise<void> {
    this.assertGloballyEnabled();
    const events = await tx.$queryRaw<Array<{ id: string; optionalInclusionsEnabled: boolean }>>(
      Prisma.sql`
        SELECT id, optional_inclusions_enabled AS "optionalInclusionsEnabled"
        FROM events
        WHERE id = ${eventId}
        FOR SHARE
      `,
    );
    if (!events[0]) throw new NotFoundException('Event not found');
    if (!events[0].optionalInclusionsEnabled) {
      throw new NotFoundException('Optional inclusions are not enabled for this event');
    }
  }

  private validateConsumableQuote(
    raw: Awaited<ReturnType<PrismaService['checkoutQuote']['findUnique']>>,
    userId: string,
    eventId: string,
    tierId: string,
    attendeeCount: number,
  ): ConsumableInclusionQuote {
    if (!raw) throw new NotFoundException('Checkout quote not found');
    if (raw.status !== 'active')
      throw new ConflictException('Checkout quote has already been used or cancelled');
    if (raw.expiresAt <= new Date())
      throw new ConflictException('Checkout quote expired; request a new quote');
    if (raw.userId && raw.userId !== userId)
      throw new ForbiddenException('Checkout quote belongs to another customer');
    if (
      raw.eventId !== eventId ||
      raw.ticketTierId !== tierId ||
      raw.attendeeCount !== attendeeCount
    )
      throw new BadRequestException('Checkout quote does not match this registration');
    const snapshot = raw.pricingSnapshot as unknown as QuotePricingSnapshot;
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.lines))
      throw new ConflictException('Checkout quote format is invalid');
    return { ...raw, lines: snapshot.lines };
  }

  private normalizeSelections(selections: CreateInclusionQuoteDto['selections']) {
    const grouped = new Map<string, CreateInclusionQuoteDto['selections'][number]>();
    for (const selection of selections) {
      const key = `${selection.inclusionId}:${selection.variantId}:${selection.attendeeIndex ?? 'none'}`;
      const current = grouped.get(key);
      grouped.set(
        key,
        current
          ? { ...current, quantity: current.quantity + selection.quantity }
          : { ...selection },
      );
    }
    return [...grouped.values()];
  }

  private async calculateAdmissionReferralDiscount(
    eventId: string,
    tierId: string,
    code: string,
    admissionSubtotal: Prisma.Decimal,
  ) {
    const referral = await this.prisma.referralCode.findFirst({
      where: { eventId, code, deletedAt: null },
    });
    if (!referral || !referral.isActive)
      throw new BadRequestException('Referral code is invalid or inactive');
    const now = new Date();
    if (referral.validFrom && referral.validFrom > now)
      throw new BadRequestException('Referral code is not active yet');
    if (referral.validUntil && referral.validUntil < now)
      throw new BadRequestException('Referral code has expired');
    const tierIds = Array.isArray(referral.applicableTierIds)
      ? referral.applicableTierIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (tierIds.length && !tierIds.includes(tierId))
      throw new BadRequestException('Referral code does not apply to this ticket tier');
    if (referral.maxUses) {
      const used = await this.prisma.referralCodeUsage.count({
        where: { referralCodeId: referral.id },
      });
      if (used >= referral.maxUses)
        throw new BadRequestException('Referral code usage limit has been reached');
    }
    const raw =
      referral.discountType === 'percentage'
        ? admissionSubtotal.mul(referral.discountValue).div(100)
        : referral.discountValue;
    if (raw.lte(0)) return new Prisma.Decimal(0);
    return Prisma.Decimal.min(raw, admissionSubtotal).toDecimalPlaces(2);
  }

  private variantCreateData(dto: InclusionVariantInputDto) {
    return {
      name: dto.name.trim(),
      sku: dto.sku?.trim() || null,
      price: new Prisma.Decimal(dto.price),
      totalStock: dto.totalStock,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    };
  }

  private validateSaleWindow(starts?: string | null, ends?: string | null) {
    if (starts && ends && new Date(starts) >= new Date(ends))
      throw new BadRequestException('Sale end must be after sale start');
  }

  private resolveTierEligibility(
    dto: Pick<CreateEventInclusionDto, 'eligibleTierIds' | 'tierEligibility'>,
  ) {
    if (dto.tierEligibility !== undefined && dto.eligibleTierIds !== undefined) {
      throw new BadRequestException('Send tierEligibility or eligibleTierIds, not both');
    }
    const entries =
      dto.tierEligibility?.map((entry) => ({
        ticketTierId: entry.tierId,
        maxQuantityPerRegistration: entry.maxQuantityPerRegistration ?? null,
      })) ??
      (dto.eligibleTierIds ?? []).map((ticketTierId) => ({
        ticketTierId,
        maxQuantityPerRegistration: null,
      }));
    if (new Set(entries.map((entry) => entry.ticketTierId)).size !== entries.length) {
      throw new BadRequestException('Each eligible ticket tier may only be configured once');
    }
    return entries;
  }

  private async assertTierIdsBelongToEvent(eventId: string, tierIds: string[]) {
    if (!tierIds.length) return;
    const count = await this.prisma.ticketTier.count({
      where: { eventId, id: { in: [...new Set(tierIds)] } },
    });
    if (count !== new Set(tierIds).size)
      throw new BadRequestException(
        'One or more eligible ticket tiers do not belong to this event',
      );
  }

  private async requireInclusion(eventId: string, inclusionId: string) {
    const inclusion = await this.prisma.eventInclusion.findFirst({
      where: { id: inclusionId, eventId },
      select: { id: true },
    });
    if (!inclusion) throw new NotFoundException('Optional inclusion not found');
  }
}
