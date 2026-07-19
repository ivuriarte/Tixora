import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EventAccessService } from '../common/services/event-access.service';
import { EventsService } from '../events/events.service';
import { TicketTiersService } from '../ticket-tiers/ticket-tiers.service';
import { OrdersService } from '../orders/orders.service';
import { CreateEventDto, UpdateEventDto } from '../events/dto/event.dto';
import { CreateTierDto, UpdateTierDto } from '../ticket-tiers/dto/tier.dto';
import {
  verifyQrToken,
  verifyAttendeeQrToken,
} from '@axon-tickets/utils';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { JwtPayload } from '@axon-tickets/types';
import { CreateReferralCodeDto, UpdateReferralCodeDto } from './dto/referral-code.dto';

type SelectedSubEventSnapshot = {
  id?: unknown;
  title?: unknown;
  time?: unknown;
};

interface NametagRow {
  id: string;
  name: string;
  company: string;
  position: string;
  tierName: string;
  inclusions: string[];
  createdAt: Date;
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function alreadyCheckedInException(checkedInAt: Date | null): ConflictException {
  return new ConflictException({
    code: 'ALREADY_CHECKED_IN',
    message: 'This ticket has already been checked in.',
    checkedInAt: checkedInAt?.toISOString() ?? null,
  });
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventAccess: EventAccessService,
    private readonly eventsService: EventsService,
    private readonly tiersService: TicketTiersService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
  ) {}

  private eventOwnerWhere(user: JwtPayload): Prisma.EventWhereInput {
    return this.eventAccess.eventOwnerWhere(user);
  }

  async assertEventAccess(eventId: string, user: JwtPayload): Promise<void> {
    return this.eventAccess.assertEventAccess(eventId, user);
  }

  async assertRegistrationAccess(registrationId: string, user: JwtPayload): Promise<void> {
    return this.eventAccess.assertRegistrationAccess(registrationId, user);
  }

  private checkInDateFor(date = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  private parseCheckInDate(date?: string): Date {
    if (!date) return this.checkInDateFor();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must use YYYY-MM-DD format');
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException('date must be a valid calendar date');
    }
    return parsed;
  }

  private async createDailyAttendance(
    tx: Prisma.TransactionClient,
    attendee: { id: string; registrationId: string },
    eventId: string,
    adminId: string,
    method: string,
    now = new Date(),
  ) {
    const checkInDate = this.checkInDateFor(now);
    const existing = await tx.attendeeAttendance.findFirst({
      where: { attendeeId: attendee.id, eventId, checkInDate },
      select: { checkedInAt: true },
    });
    if (existing) throw alreadyCheckedInException(existing.checkedInAt);

    try {
      const attendance = await tx.attendeeAttendance.create({
        data: {
          attendeeId: attendee.id,
          registrationId: attendee.registrationId,
          eventId,
          checkInDate,
          checkedInAt: now,
          checkedInById: adminId,
          checkInMethod: method,
        },
      });

      await tx.attendee.updateMany({
        where: { id: attendee.id, checkedInAt: null },
        data: { checkedInAt: now, checkedInById: adminId, checkInMethod: method },
      });

      return attendance;
    } catch (error) {
      // Do not query again after a unique-constraint failure: PostgreSQL has
      // already aborted this transaction. The pre-check above supplies the
      // timestamp for normal repeat scans; this branch safely handles races.
      if (isPrismaErrorCode(error, 'P2002')) throw alreadyCheckedInException(null);
      throw error;
    }
  }

  // ── User Management ────────────────────────────────────────────────────

  async listUsers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isAdmin: true,
          isVerified: true,
          createdAt: true,
        },
      }),
    ]);
    return { data: users, total, page, limit };
  }

  async setAdminRole(userId: string, isAdmin: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin },
      select: { id: true, email: true, firstName: true, lastName: true, isAdmin: true },
    });
  }

  // ── Events ──────────────────────────────────────────────────────────────

  async createEvent(dto: CreateEventDto, user: JwtPayload) {
    const organizationId = user.isAdmin
      ? undefined
      : await this.getApprovedOrganizationIdForUser(user.sub);
    return this.eventsService.create(dto, user.sub, organizationId);
  }

  private async getApprovedOrganizationIdForUser(userId: string): Promise<string> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        organization: { approvalStatus: 'approved' },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { organizationId: true },
    });
    if (!membership) throw new BadRequestException('Approved organizer account required to create events');
    return membership.organizationId;
  }

  async getEvent(id: string, user: JwtPayload) {
    const event = await this.prisma.event.findFirst({
      where: { id, ...this.eventOwnerWhere(user) },
      include: {
        tiers: {
          orderBy: { sortOrder: 'asc' },
          include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const tiers = await this.eventsService.withLiveInventory(event.tiers);
    return { ...event, tiers };
  }

  async updateEvent(id: string, dto: UpdateEventDto, user: JwtPayload) {
    await this.assertEventAccess(id, user);
    const updated = await this.eventsService.update(id, dto);
    await this.audit.log({
      action: 'EVENT_UPDATED',
      entityType: 'Event',
      entityId: id,
      performedById: user.sub,
      metadata: Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>,
    });
    return updated;
  }

  async listReferralCodes(eventId: string, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    const [codes, usageTotals] = await Promise.all([
      this.prisma.referralCode.findMany({
        where: { eventId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { usages: true } } },
      }),
      this.prisma.referralCodeUsage.groupBy({
        by: ['referralCodeId'],
        where: { referralCode: { eventId, deletedAt: null } },
        _sum: { attendeeCount: true, discountAmount: true },
      }),
    ]);
    const totalsByCode = new Map(usageTotals.map((total) => [total.referralCodeId, total._sum]));
    return codes.map((code) => ({
      id: code.id,
      code: code.code,
      name: code.name,
      discountType: code.discountType,
      discountValue: Number(code.discountValue),
      isActive: code.isActive,
      maxUses: code.maxUses,
      validFrom: code.validFrom?.toISOString() ?? null,
      validUntil: code.validUntil?.toISOString() ?? null,
      applicableTierIds: Array.isArray(code.applicableTierIds) ? code.applicableTierIds : [],
      usageCount: code._count.usages,
      attendeeCount: totalsByCode.get(code.id)?.attendeeCount ?? 0,
      totalDiscount: Number(totalsByCode.get(code.id)?.discountAmount ?? 0),
      createdAt: code.createdAt.toISOString(),
    }));
  }

  async createReferralCode(eventId: string, dto: CreateReferralCodeDto, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    const code = dto.code.trim().toUpperCase();
    if (dto.discountType === 'percentage' && dto.discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%.');
    }
    if (dto.validFrom && dto.validUntil && new Date(dto.validUntil) <= new Date(dto.validFrom)) {
      throw new BadRequestException('Validity end must be after its start.');
    }
    if (dto.applicableTierIds?.length) {
      const count = await this.prisma.ticketTier.count({
        where: { eventId, id: { in: dto.applicableTierIds } },
      });
      if (count !== new Set(dto.applicableTierIds).size) {
        throw new BadRequestException('One or more selected ticket tiers do not belong to this event.');
      }
    }
    try {
      const created = await this.prisma.referralCode.create({
        data: {
          eventId,
          code,
          name: dto.name.trim(),
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          maxUses: dto.maxUses ?? null,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          applicableTierIds: dto.applicableTierIds ?? Prisma.JsonNull,
          createdById: user.sub,
        },
      });
      await this.audit.log({
        action: 'REFERRAL_CODE_CREATED',
        entityType: 'ReferralCode',
        entityId: created.id,
        performedById: user.sub,
        metadata: { eventId, code, discountType: dto.discountType },
      });
      return created;
    } catch (error) {
      if (isPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException('That referral code already exists for this event.');
      }
      throw error;
    }
  }

  async setReferralCodeStatus(eventId: string, codeId: string, isActive: boolean, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    const existing = await this.prisma.referralCode.findFirst({ where: { id: codeId, eventId } });
    if (!existing) throw new NotFoundException('Referral code not found');
    const updated = await this.prisma.referralCode.update({
      where: { id: codeId },
      data: { isActive, deactivatedAt: isActive ? null : new Date() },
    });
    await this.audit.log({
      action: isActive ? 'REFERRAL_CODE_ACTIVATED' : 'REFERRAL_CODE_DEACTIVATED',
      entityType: 'ReferralCode',
      entityId: codeId,
      performedById: user.sub,
      metadata: { eventId, code: existing.code },
    });
    return updated;
  }

  async updateReferralCode(eventId: string, codeId: string, dto: UpdateReferralCodeDto, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    const existing = await this.prisma.referralCode.findFirst({ where: { id: codeId, eventId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Referral code not found');
    if (dto.validFrom && dto.validUntil && new Date(dto.validUntil) <= new Date(dto.validFrom)) {
      throw new BadRequestException('Validity end must be after its start.');
    }
    const data: Prisma.ReferralCodeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if ('maxUses' in dto) data.maxUses = dto.maxUses ?? null;
    if ('validFrom' in dto) data.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if ('validUntil' in dto) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    const updated = await this.prisma.referralCode.update({ where: { id: codeId }, data });
    await this.audit.log({
      action: 'REFERRAL_CODE_UPDATED',
      entityType: 'ReferralCode',
      entityId: codeId,
      performedById: user.sub,
      metadata: { eventId, code: existing.code, changes: dto },
    });
    return updated;
  }

  async deleteReferralCode(eventId: string, codeId: string, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    const existing = await this.prisma.referralCode.findFirst({ where: { id: codeId, eventId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Referral code not found');
    // Soft-delete: mark as deleted and inactive so no new registrations can use it.
    // Existing ReferralCodeUsage rows (and their discountAmount) are preserved untouched,
    // so every attendee who already used this code keeps their discount.
    await this.prisma.referralCode.update({
      where: { id: codeId },
      data: { deletedAt: new Date(), isActive: false, deactivatedAt: new Date() },
    });
    await this.audit.log({
      action: 'REFERRAL_CODE_DELETED',
      entityType: 'ReferralCode',
      entityId: codeId,
      performedById: user.sub,
      metadata: { eventId, code: existing.code },
    });
    return { deleted: true };
  }

  async exportReferralCodes(eventId: string, user: JwtPayload): Promise<string> {
    await this.assertEventAccess(eventId, user);
    const usages = await this.prisma.referralCodeUsage.findMany({
      where: { referralCode: { eventId } },
      orderBy: { createdAt: 'desc' },
      include: {
        referralCode: { select: { code: true, name: true } },
        registration: { select: { referenceNumber: true, tierName: true, total: true } },
      },
    });
    const header = 'Code,Name,Registration,Tier,Attendees,Discount (PHP),Final Total (PHP),Used At\n';
    return header + usages.map((usage) => [
      this.escapeCsvCell(usage.referralCode.code),
      `"${this.escapeCsvCell(usage.referralCode.name)}"`,
      this.escapeCsvCell(usage.registration.referenceNumber),
      `"${this.escapeCsvCell(usage.registration.tierName ?? '')}"`,
      usage.attendeeCount,
      Number(usage.discountAmount).toFixed(2),
      Number(usage.registration.total).toFixed(2),
      usage.createdAt.toISOString(),
    ].join(',')).join('\n');
  }

  async deleteEvent(id: string, user: JwtPayload) {
    const event = await this.prisma.event.findFirst({ where: { id, ...this.eventOwnerWhere(user) }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');

    // Single transaction: remove all dependents without a prior findMany round-trip
    await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany({ where: { registration: { eventId: id } } }),
      this.prisma.registration.deleteMany({ where: { eventId: id } }),   // cascades Attendees, PaymentProofs
      this.prisma.order.deleteMany({ where: { eventId: id } }),          // cascades OrderItems, Tickets, FraudFlags
      this.prisma.reservation.deleteMany({ where: { eventId: id } }),
    ]);
    return this.prisma.event.delete({ where: { id } });                  // cascades TicketTiers, EventViews
  }

  async listEvents(user: JwtPayload, page = 1, limit = 20, organizationId?: string) {
    await this.eventsService.autoCompleteExpiredEvents();
    const skip = (page - 1) * limit;
    const where: Prisma.EventWhereInput = {
      ...this.eventOwnerWhere(user),
      ...(user.isAdmin && organizationId ? { organizationId } : {}),
    };
    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tickets: true, orders: true } },
          organization: { select: { id: true, name: true } },
          tiers: { select: { id: true, name: true, price: true, totalQuantity: true, soldQuantity: true } },
        },
      }),
    ]);

    const tiersByEvent = await Promise.all(
      events.map((e) => this.eventsService.withLiveInventory(e.tiers)),
    );

    return {
      data: events.map((e: (typeof events)[number], index) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        description: e.description,
        imageUrl: e.imageUrl ?? null,
        featuredImageUrl: e.featuredImageUrl ?? null,
        venue: e.venue,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        isFree: e.isFree,
        onsiteRegistrationEnabled: e.onsiteRegistrationEnabled,
        isFeatured: e.isFeatured,
        featuredOrder: e.featuredOrder,
        featuredUntil: e.featuredUntil?.toISOString() ?? null,
        tagline: e.tagline,
        organization: e.organization ? { id: e.organization.id, name: e.organization.name } : null,
        maxCapacity: e.maxCapacity ?? null,
        ticketsSold: tiersByEvent[index].reduce((sum, tier) => sum + tier.soldQuantity, 0),
        ordersCount: e._count.orders,
        lowestPrice: e.isFree
          ? 0
          : e.tiers.length > 0
          ? Math.min(...e.tiers.map((t: (typeof e.tiers)[number]) => Number(t.price)))
          : null,
        tiers: tiersByEvent[index].map((t) => ({
          name: t.name,
          totalQuantity: t.totalQuantity,
          soldQuantity: t.soldQuantity,
          availableQuantity: t.availableQuantity,
        })),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  // ── Tiers ──────────────────────────────────────────────────────────────

  async createTier(eventId: string, dto: CreateTierDto, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    return this.tiersService.create(eventId, dto);
  }

  async updateTier(tierId: string, dto: UpdateTierDto, user: JwtPayload) {
    const tier = await this.prisma.ticketTier.findUnique({ where: { id: tierId }, select: { eventId: true } });
    if (!tier) throw new NotFoundException('Ticket tier not found');
    await this.assertEventAccess(tier.eventId, user);
    return this.tiersService.update(tierId, dto);
  }

  async deleteTier(tierId: string, user: JwtPayload) {
    const tier = await this.prisma.ticketTier.findUnique({ where: { id: tierId }, select: { eventId: true } });
    if (!tier) throw new NotFoundException('Ticket tier not found');
    await this.assertEventAccess(tier.eventId, user);
    return this.tiersService.delete(tierId);
  }

  // ── Orders ──────────────────────────────────────────────────────────────

  async listOrders(user: JwtPayload, eventId?: string, status?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    if (eventId) await this.assertEventAccess(eventId, user);

    // Map a single UI status value to the corresponding DB values for each table.
    const VALID_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'cancelled'] as const;
    const safeStatus = status && (VALID_STATUSES as readonly string[]).includes(status)
      ? status
      : undefined;

    const orderStatusMap: Record<string, string[]> = {
      paid: ['paid'],
      pending: ['pending'],
      failed: ['failed'],
      refunded: ['refunded'],
      cancelled: ['cancelled'],
    };
    // Registration statuses that map to the UI status values
    const regStatusMap: Record<string, string[]> = {
      paid: ['verified'],
      pending: ['pending_payment', 'pending_approval'],
      failed: ['rejected'],
      cancelled: ['cancelled'],
    };

    const orderStatusFilter = safeStatus ? orderStatusMap[safeStatus] : undefined;
    const regStatusFilter   = safeStatus ? (regStatusMap[safeStatus] ?? []) : undefined;

    const orderWhere = {
      ...(eventId ? { eventId } : {}),
      ...(!user.isAdmin ? { event: this.eventOwnerWhere(user) } : {}),
      ...(orderStatusFilter ? { status: { in: orderStatusFilter as Prisma.EnumOrderStatusFilter['in'] } } : {}),
    };

    const regWhere = {
      ...(eventId ? { eventId } : {}),
      ...(!user.isAdmin ? { event: this.eventOwnerWhere(user) } : {}),
      ...(regStatusFilter && regStatusFilter.length
        ? { status: { in: regStatusFilter as Prisma.EnumRegistrationStatusFilter['in'] } }
        : {}),
    };

    // Skip the registration query entirely when the status filter has no registration equivalent.
    const includeRegs = !safeStatus || (regStatusFilter && regStatusFilter.length > 0);

    const regQuery = this.prisma.registration.findMany({
      where: regWhere,
      orderBy: { createdAt: 'desc' },
      take: 2_000,
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        event: { select: { title: true, slug: true } },
        attendees: { where: { isLead: true }, take: 1, select: { firstName: true, lastName: true, email: true } },
      },
    });
    type RegRow = Awaited<typeof regQuery>[number];

    const [orders, registrations] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        orderBy: { createdAt: 'desc' },
        take: 2_000,
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          event: { select: { title: true, slug: true } },
        },
      }),
      includeRegs ? regQuery : Promise.resolve([] as RegRow[]),
    ]);

    type NormalizedRow = {
      id: string;
      source: 'order' | 'registration';
      reference: string;
      userEmail: string;
      userName: string;
      eventTitle: string;
      eventSlug: string;
      status: string;
      total: number;
      paymentMethod: string | null;
      createdAt: Date;
    };

    const normalizedOrders: NormalizedRow[] = orders.map((o: (typeof orders)[number]) => ({
      id: o.id,
      source: 'order',
      reference: o.id,
      userEmail: o.user.email,
      userName: `${o.user.firstName} ${o.user.lastName}`,
      eventTitle: o.event.title,
      eventSlug: o.event.slug,
      status: o.status,
      total: Number(o.total),
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
    }));

    const normalizedRegs: NormalizedRow[] = registrations.map((r) => ({
      id: r.id,
      source: 'registration',
      reference: r.referenceNumber,
      userEmail: r.attendees[0]?.email ?? r.user?.email ?? '',
      userName: r.attendees[0]
        ? `${r.attendees[0].firstName} ${r.attendees[0].lastName}`
        : r.user
          ? `${r.user.firstName} ${r.user.lastName}`
          : 'Walk-in attendee',
      eventTitle: r.event.title,
      eventSlug: r.event.slug,
      // Normalise to a UI-friendly status so the frontend badge logic is consistent.
      status: r.status === 'verified' ? 'paid'
            : ['pending_payment', 'pending_approval'].includes(r.status) ? 'pending'
            : r.status === 'rejected' ? 'failed'
            : r.status,
      total: Number(r.total),
      paymentMethod: r.paymentMethod,
      createdAt: r.createdAt,
    }));

    const all: NormalizedRow[] = [...normalizedOrders, ...normalizedRegs]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = all.length;
    const paged = all.slice(skip, skip + limit);

    return {
      data: paged.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getOrder(orderId: string, user: JwtPayload) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...(!user.isAdmin ? { event: this.eventOwnerWhere(user) } : {}) },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        event: { select: { id: true, title: true, slug: true, startsAt: true, venue: true } },
        items: { include: { ticketTier: { select: { name: true } } } },
        tickets: { select: { id: true, qrCode: true, status: true, checkedInAt: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      id: order.id,
      status: order.status,
      userEmail: order.user.email,
      userName: `${order.user.firstName} ${order.user.lastName}`,
      userId: order.user.id,
      eventId: order.event.id,
      eventTitle: order.event.title,
      eventSlug: order.event.slug,
      eventStartsAt: order.event.startsAt.toISOString(),
      eventVenue: order.event.venue,
      subtotal: Number(order.subtotal),
      fees: Number(order.fees),
      total: Number(order.total),
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      paymentRef: order.paymentRef,
      items: order.items.map((item: (typeof order.items)[number]) => ({
        id: item.id,
        tierName: item.ticketTier.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      tickets: order.tickets.map((t: (typeof order.tickets)[number]) => ({
        id: t.id,
        status: t.status,
        checkedInAt: t.checkedInAt?.toISOString() ?? null,
      })),
      createdAt: order.createdAt.toISOString(),
    };
  }

  async resendTicket(orderId: string, user: JwtPayload) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...(!user.isAdmin ? { event: this.eventOwnerWhere(user) } : {}) },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        event: { select: { title: true, startsAt: true, venue: true } },
        tickets: { select: { id: true, qrCode: true, ticketTier: { select: { name: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'paid') throw new BadRequestException('Order is not confirmed');

    await this.sendTicketConfirmation(
      order.user.email,
      `${order.user.firstName} ${order.user.lastName}`,
      {
        title: order.event.title,
        startsAt: order.event.startsAt.toISOString(),
        venue: order.event.venue,
      },
      order.tickets.map((t: (typeof order.tickets)[number]) => ({
        id: t.id,
        tierName: t.ticketTier.name,
        qrCode: t.qrCode,
      })),
    );

    return { resent: true };
  }

  async sendTicketConfirmation(
    toEmail: string,
    toName: string,
    event: { title: string; startsAt: string; venue: string },
    tickets: Array<{ id: string; tierName: string; qrCode: string }>,
  ) {
    const ticketRows = tickets
      .map(
        (t) =>
          `<tr>
            <td style="padding:12px;border-bottom:1px solid #e5e7eb">${t.tierName}</td>
            <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(t.qrCode)}"
                   alt="QR Code" width="150" height="150" />
              <br/><small style="color:#6b7280;font-size:11px">${t.id}</small>
            </td>
          </tr>`,
      )
      .join('');

    await this.emailService.send(
      toEmail,
      `Your tickets for ${event.title}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h1 style="color:#7c3aed;margin-bottom:4px">You're going!</h1>
          <h2 style="margin-top:0">${event.title}</h2>
          <p style="color:#6b7280">${new Date(event.startsAt).toLocaleDateString('en-PH', { dateStyle: 'full' })} · ${event.venue}</p>
          <p>Hi ${toName}, here are your tickets. Show the QR code at the door.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:12px;text-align:left">Tier</th>
                <th style="padding:12px;text-align:center">QR Code</th>
              </tr>
            </thead>
            <tbody>${ticketRows}</tbody>
          </table>
          <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
        </div>`,
    );
  }

  async checkIn(qrToken: string, eventId: string, adminId: string) {
    if (!eventId) throw new BadRequestException('Event is required for check-in');

    const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';

    // ── Path A: Attendee QR token (registration / manual-payment flow) ──────
    const attendeePayload = verifyAttendeeQrToken(qrToken, qrSecret);
    if (attendeePayload) {
      const attendee = await this.prisma.attendee.findUnique({
        where: { id: attendeePayload.attendeeId },
        include: {
          registration: {
            select: {
              id: true,
              status: true,
              tierName: true,
              event: { select: { id: true, title: true } },
            },
          },
        },
      });

      if (!attendee) throw new NotFoundException('Attendee not found');

      // Token fields must match DB record
      if (
        attendee.registration.event.id !== attendeePayload.eventId ||
        attendee.registrationId !== attendeePayload.registrationId
      ) {
        throw new BadRequestException('QR token mismatch');
      }

      if (attendee.registration.event.id !== eventId) {
        throw new BadRequestException(
          `This QR is for ${attendee.registration.event.title}, not the selected event.`,
        );
      }

      if (attendee.registration.status !== 'verified') {
        throw new BadRequestException(
          `Registration is not verified (status: ${attendee.registration.status})`,
        );
      }

      const now = new Date();
      const attendance = await this.prisma.$transaction((tx) =>
        this.createDailyAttendance(tx, attendee, eventId, adminId, 'scan', now),
      );

      await this.audit.log({
        action: 'CHECKIN_SCAN',
        entityType: 'Attendee',
        entityId: attendee.id,
        registrationId: attendee.registrationId,
        performedById: adminId,
        metadata: {
          eventId: attendeePayload.eventId,
          attendanceId: attendance.id,
          checkInDate: attendance.checkInDate.toISOString().slice(0, 10),
          checkInMethod: 'scan',
        },
      });

      return {
        valid: true,
        attendeeName: `${attendee.firstName} ${attendee.lastName}`,
        tierName: attendee.registration.tierName ?? null,
        eventTitle: attendee.registration.event.title,
        checkedInAt: now.toISOString(),
        checkInDate: attendance.checkInDate.toISOString().slice(0, 10),
        checkInMethod: 'scan',
      };
    }

    // ── Path B: Legacy Ticket QR token (online order flow) ───────
    const payload = verifyQrToken(qrToken, qrSecret);
    if (!payload) throw new BadRequestException('Invalid QR code');

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: payload.ticketId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        ticketTier: { select: { name: true } },
        event: { select: { id: true, title: true } },
        order: { select: { status: true, paymentMethod: true } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== payload.userId || ticket.eventId !== payload.eventId) {
      throw new BadRequestException('QR token mismatch');
    }

    if (ticket.eventId !== eventId) {
      throw new BadRequestException(
        `This QR is for ${ticket.event.title}, not the selected event.`,
      );
    }

    if (ticket.status !== 'valid') {
      if (ticket.status === 'used') {
        throw alreadyCheckedInException(ticket.checkedInAt);
      }
      throw new BadRequestException(`Ticket is ${ticket.status}`);
    }

    const now = new Date();
    const ticketResult = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: 'valid' },
      data: { status: 'used', checkedInAt: now, checkedInById: adminId },
    });

    if (ticketResult.count === 0) {
      const fresh = await this.prisma.ticket.findUnique({
        where: { id: ticket.id },
        select: { status: true, checkedInAt: true },
      });
      if (fresh?.status === 'used') {
        throw alreadyCheckedInException(fresh.checkedInAt);
      }
      throw new BadRequestException(`Ticket is ${fresh?.status ?? 'unavailable'}`);
    }

    await this.audit.log({
      action: 'CHECKIN_SCAN',
      entityType: 'Ticket',
      entityId: ticket.id,
      performedById: adminId,
      metadata: { eventId: payload.eventId, checkInMethod: 'scan' },
    });

    return {
      valid: true,
      attendeeName: `${ticket.user.firstName} ${ticket.user.lastName}`,
      tierName: ticket.ticketTier.name,
      eventTitle: ticket.event.title,
      checkedInAt: now.toISOString(),
      orderStatus: ticket.order?.status ?? null,
      paymentMethod: ticket.order?.paymentMethod ?? null,
      checkInMethod: 'scan',
    };
  }

  // ── Attendees ──────────────────────────────────────────────────────────

  /**
   * P6-06 — Search attendees by name, email, or transaction reference number within an event.
   */
  async checkinSearch(eventId: string, q: string, page = 1, limit = 20) {
    if (!eventId) throw new BadRequestException('eventId is required');
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(limit, 50);
    const skip = (safePage - 1) * safeLimit;
    const today = this.checkInDateFor();

    const where: Prisma.AttendeeWhereInput = {
      registration: { eventId },
    };

    if (q?.trim()) {
      const term = q.trim();
      const parts = term.split(/\s+/).filter(Boolean);
      const orClauses: Prisma.AttendeeWhereInput[] = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { registration: { referenceNumber: { contains: term, mode: 'insensitive' } } },
      ];
      if (parts.length >= 2) {
        // "First Last" → firstName contains first word, lastName contains rest
        orClauses.push({
          AND: [
            { firstName: { contains: parts[0], mode: 'insensitive' } },
            { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' } },
          ],
        } as Prisma.AttendeeWhereInput);
        // "First Middle Last" → firstName contains all but last, lastName contains last
        orClauses.push({
          AND: [
            { firstName: { contains: parts.slice(0, -1).join(' '), mode: 'insensitive' } },
            { lastName: { contains: parts[parts.length - 1], mode: 'insensitive' } },
          ],
        } as Prisma.AttendeeWhereInput);
      }
      where.OR = orClauses;
    }

    const [total, attendees] = await Promise.all([
      this.prisma.attendee.count({ where }),
      this.prisma.attendee.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
        include: {
          registration: {
            select: {
              status: true,
              tierName: true,
              referenceNumber: true,
              event: { select: { title: true } },
            },
          },
          attendanceRecords: {
            where: { eventId, checkInDate: today },
            select: { checkedInAt: true, checkInMethod: true },
            take: 1,
          },
        },
      }),
    ]);

    return {
      data: attendees.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        subEventTitle: a.subEventTitle ?? null,
        subEventTime: a.subEventTime ?? null,
        tierName: a.registration.tierName ?? null,
        referenceNumber: a.registration.referenceNumber,
        eventTitle: a.registration.event.title,
        registrationStatus: a.registration.status,
        checkedInAt: a.attendanceRecords[0]?.checkedInAt.toISOString() ?? null,
        firstCheckedInAt: a.checkedInAt?.toISOString() ?? null,
        hasQr: !!a.qrToken,
      })),
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  /**
   * P6-05 (manual path) — Check in an attendee by ID (manual lookup, no QR scan).
   */
  async checkinManual(attendeeId: string, eventId: string, adminId: string) {
    if (!eventId) throw new BadRequestException('Event is required for check-in');

    const attendee = await this.prisma.attendee.findUnique({
      where: { id: attendeeId },
      include: {
        registration: {
          select: {
            id: true,
            status: true,
            tierName: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!attendee) throw new NotFoundException('Attendee not found');
    if (attendee.registration.event.id !== eventId) {
      throw new BadRequestException(
        `This attendee belongs to ${attendee.registration.event.title}, not the selected event.`,
      );
    }
    if (attendee.registration.status !== 'verified') {
      throw new BadRequestException(
        `Registration is not verified (status: ${attendee.registration.status})`,
      );
    }
    const now = new Date();
    const attendance = await this.prisma.$transaction((tx) =>
      this.createDailyAttendance(tx, attendee, eventId, adminId, 'manual', now),
    );

    await this.audit.log({
      action: 'CHECKIN_MANUAL',
      entityType: 'Attendee',
      entityId: attendeeId,
      registrationId: attendee.registrationId,
      performedById: adminId,
      metadata: {
        attendanceId: attendance.id,
        checkInDate: attendance.checkInDate.toISOString().slice(0, 10),
        checkInMethod: 'manual',
      },
    });

    return {
      valid: true,
      attendeeName: `${attendee.firstName} ${attendee.lastName}`,
      tierName: attendee.registration.tierName ?? null,
      eventTitle: attendee.registration.event.title,
      checkedInAt: now.toISOString(),
      checkInDate: attendance.checkInDate.toISOString().slice(0, 10),
      checkInMethod: 'manual',
    };
  }

  async getDailyAttendance(eventId: string, date?: string) {
    const checkInDate = this.parseCheckInDate(date);
    const records = await this.prisma.attendeeAttendance.findMany({
      where: { eventId, checkInDate },
      orderBy: { checkedInAt: 'desc' },
      include: {
        attendee: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, subEventTitle: true, subEventTime: true } },
        registration: { select: { id: true, referenceNumber: true, tierName: true } },
        checkedInBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return {
      date: checkInDate.toISOString().slice(0, 10),
      total: records.length,
      data: records.map((record) => ({
        id: record.id,
        attendeeId: record.attendeeId,
        registrationId: record.registrationId,
        referenceNumber: record.registration.referenceNumber,
        attendeeName: this.compactName(record.attendee.firstName, record.attendee.lastName),
        email: record.attendee.email,
        phone: record.attendee.phone,
        tierName: record.registration.tierName,
        subEventTitle: record.attendee.subEventTitle,
        subEventTime: record.attendee.subEventTime,
        checkedInAt: record.checkedInAt.toISOString(),
        checkInMethod: record.checkInMethod,
        checkedInBy: record.checkedInBy
          ? this.compactName(record.checkedInBy.firstName, record.checkedInBy.lastName) || record.checkedInBy.email
          : null,
      })),
    };
  }

  async getAttendees(eventId: string, page = 1, limit = 50, q?: string) {
    const skip = (page - 1) * limit;
    const term = q?.trim();
    const today = this.checkInDateFor();

    // ── Path A: Registration flow (Attendee records from verified registrations) ──
    const attendeeWhere: Prisma.AttendeeWhereInput = {
      registration: { eventId, status: 'verified' },
      ...(term
        ? {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { subEventTitle: { contains: term, mode: 'insensitive' } },
            { company: { contains: term, mode: 'insensitive' } },
          ],
          }
        : {}),
    };

    // ── Path B: Online order flow (Ticket records from paid orders) ──────────
    const ticketBaseWhere: Prisma.TicketWhereInput = {
      eventId,
      status: { in: ['valid', 'used'] },
    };
    const ticketWhere: Prisma.TicketWhereInput = term
      ? {
          ...ticketBaseWhere,
          user: {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
              { company: { contains: term, mode: 'insensitive' } },
            ],
          },
        }
      : ticketBaseWhere;

    const [attendees, tickets] = await Promise.all([
      this.prisma.attendee.findMany({
        where: attendeeWhere,
        orderBy: { createdAt: 'desc' },
        take: 2_000,
        include: {
          registration: { select: { tierName: true, paymentMethod: true, status: true } },
          attendanceRecords: {
            where: { eventId, checkInDate: today },
            select: { checkedInAt: true },
            take: 1,
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: ticketWhere,
        orderBy: { createdAt: 'desc' },
        take: 2_000,
        include: {
          user: { select: { email: true, firstName: true, lastName: true, company: true, jobTitle: true, city: true, phone: true } },
          ticketTier: { select: { name: true } },
          order: { select: { status: true, paymentMethod: true } },
        },
      }),
    ]);

    // Merge both flows into a unified shape; Registration attendees come first
    const unified = [
      ...attendees.map((a) => ({
        id: a.id,
        userEmail: a.email,
        userName: `${a.firstName} ${a.lastName}`,
        userCompany: a.company ?? null,
        userJobTitle: a.jobTitle ?? null,
        userCity: a.city ?? null,
        userPhone: a.phone ?? null,
        subEvents: this.formatSelectedSubEvents(a.selectedSubEvents, a.subEventTitle, a.subEventTime),
        tierName: a.registration.tierName ?? 'Registration',
        orderStatus: a.registration.status === 'verified' ? 'paid' : 'pending',
        paymentMethod: a.registration.paymentMethod ?? null,
        status: a.attendanceRecords[0] ? 'used' : 'valid',
        checkedInAt: a.attendanceRecords[0]?.checkedInAt.toISOString() ?? null,
        firstCheckedInAt: a.checkedInAt?.toISOString() ?? null,
      })),
      ...tickets.map((t) => ({
        id: t.id,
        userEmail: t.user.email,
        userName: `${t.user.firstName} ${t.user.lastName}`,
        userCompany: t.user.company ?? null,
        userJobTitle: t.user.jobTitle ?? null,
        userCity: t.user.city ?? null,
        userPhone: t.user.phone ?? null,
        subEvents: null,
        tierName: t.ticketTier.name,
        orderStatus: t.order?.status ?? null,
        paymentMethod: t.order?.paymentMethod ?? null,
        status: t.status,
        checkedInAt: t.checkedInAt?.toISOString() ?? null,
      })),
    ];

    const total = unified.length;

    return {
      data: unified.slice(skip, skip + limit),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  // ── Analytics ──────────────────────────────────────────────────────────

  async getEventAnalytics(eventId: string, user: JwtPayload) {
    await this.assertEventAccess(eventId, user);
    const [
      event,
      orderRevenueStats,
      registrationRevenueStats,
      checkedInTickets,
      validTickets,
      checkedInAttendees,
      verifiedAttendees,
      pendingRegistrations,
      verifiedAttendeesPerTier,
      validTicketsPerTier,
    ] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: eventId },
        include: { tiers: true },
      }),
      // Legacy flow: Ticket/Order revenue
      this.prisma.order.aggregate({
        where: { eventId, status: 'paid' },
        _sum: { total: true, fees: true },
        _count: { id: true },
      }),
      // Registration flow: manual-payment revenue
      this.prisma.registration.aggregate({
        where: { eventId, status: 'verified' },
        _sum: { total: true, fees: true },
        _count: { id: true },
      }),
      // Legacy flow: check-ins via Ticket
      this.prisma.ticket.count({ where: { eventId, status: 'used' } }),
      // Legacy flow: valid tickets sold
      this.prisma.ticket.count({ where: { eventId, status: { in: ['valid', 'used'] } } }),
      // Registration flow: check-ins via Attendee
      this.prisma.attendee.count({
        where: { registration: { eventId }, checkedInAt: { not: null } },
      }),
      // Registration flow: verified attendees (all attendees on verified registrations)
      this.prisma.attendee.count({
        where: { registration: { eventId, status: 'verified' } },
      }),
      // Registration flow: pending verification
      this.prisma.registration.count({
        where: { eventId, status: 'pending_payment' },
      }),
      // Count verified attendees per tier (for tier breakdown)
      this.prisma.registration.groupBy({
        by: ['tierId'],
        where: { eventId, status: 'verified', tierId: { not: null } },
        _sum: { attendeeCount: true },
      }),
      // Count valid tickets per tier (legacy flow)
      this.prisma.ticket.groupBy({
        by: ['ticketTierId'],
        where: { eventId, status: { in: ['valid', 'used'] } },
        _count: { id: true },
      }),
    ]);

    if (!event) throw new NotFoundException('Event not found');

    const totalCheckedIn = checkedInTickets + checkedInAttendees;
    const totalSold = validTickets + verifiedAttendees;
    const totalRevenue =
      Number(orderRevenueStats._sum.total ?? 0) +
      Number(registrationRevenueStats._sum.total ?? 0);
    const totalFees =
      Number(orderRevenueStats._sum.fees ?? 0) +
      Number(registrationRevenueStats._sum.fees ?? 0);

    // Build a map of tierId -> soldCount (verified only)
    const tierSoldMap = new Map<string, number>();
    for (const item of verifiedAttendeesPerTier) {
      if (item.tierId) {
        tierSoldMap.set(item.tierId, Number(item._sum?.attendeeCount ?? 0));
      }
    }
    for (const item of validTicketsPerTier) {
      if (item.ticketTierId && item._count) {
        const current = tierSoldMap.get(item.ticketTierId) ?? 0;
        const ticketCount = typeof item._count === 'object' ? (item._count.id ?? 0) : 0;
        tierSoldMap.set(item.ticketTierId, current + ticketCount);
      }
    }

    return {
      eventId,
      eventTitle: event.title,
      totalRevenue,
      totalFees,
      // Legacy (Ticket) flow
      paidOrders: orderRevenueStats._count.id,
      ticketsSold: validTickets,
      ticketCheckins: checkedInTickets,
      // Registration flow
      verifiedRegistrations: registrationRevenueStats._count.id,
      verifiedAttendees,
      pendingRegistrations,
      registrationCheckins: checkedInAttendees,
      // Combined
      totalSold,
      totalCheckedIn,
      checkInRate: totalSold > 0 ? Math.round((totalCheckedIn / totalSold) * 100) : 0,
      tierBreakdown: event.tiers.map((tier: (typeof event.tiers)[number]) => {
        const soldQuantity = tierSoldMap.get(tier.id) ?? 0;
        const available = Math.max(0, tier.totalQuantity - soldQuantity);
        const revenue = Number(tier.price) * soldQuantity;
        const fillRate =
          tier.totalQuantity > 0 ? Math.round((soldQuantity / tier.totalQuantity) * 100) : 0;
        return {
          tierId: tier.id,
          tierName: tier.name,
          totalQuantity: tier.totalQuantity,
          soldQuantity,
          available,
          price: Number(tier.price),
          revenue,
          fillRate,
        };
      }),
    };
  }

  /**
   * P7 — Daily revenue + sales timeline for an event (last N days).
   * Returns one row per calendar day in the requested range.
   */
  async getEventTimeline(eventId: string, user: JwtPayload, days = 14) {
    await this.assertEventAccess(eventId, user);

    const safeDays = Math.min(Math.max(1, days), 90);
    const since = new Date();
    since.setDate(since.getDate() - safeDays + 1);
    since.setHours(0, 0, 0, 0);

    // Raw daily aggregations from both flows
    const [orderRows, registrationRows] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; revenue: bigint; count: bigint }[]>`
        SELECT DATE_TRUNC('day', created_at) AS day,
               SUM(total)::bigint AS revenue,
               COUNT(*)::bigint AS count
        FROM orders
        WHERE event_id = ${eventId}
          AND status = 'paid'
          AND created_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ day: Date; revenue: bigint; count: bigint }[]>`
        SELECT DATE_TRUNC('day', verified_at) AS day,
               SUM(total)::bigint AS revenue,
               COUNT(*)::bigint AS count
        FROM registrations
        WHERE event_id = ${eventId}
          AND status = 'verified'
          AND verified_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    // Build a map keyed by ISO date string
    const map = new Map<string, { revenue: number; orders: number; registrations: number }>();

    for (let i = 0; i < safeDays; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      map.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0, registrations: 0 });
    }

    for (const row of orderRows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      const entry = map.get(key);
      if (entry) { entry.revenue += Number(row.revenue); entry.orders += Number(row.count); }
    }
    for (const row of registrationRows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      const entry = map.get(key);
      if (entry) { entry.revenue += Number(row.revenue); entry.registrations += Number(row.count); }
    }

    return {
      eventId,
      days: safeDays,
      series: Array.from(map.entries()).map(([date, v]) => ({
        date,
        revenue: v.revenue,
        orders: v.orders,
        registrations: v.registrations,
        total: v.orders + v.registrations,
      })),
    };
  }

  async getEventFunnel(eventId: string, user: JwtPayload) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, ...this.eventOwnerWhere(user) },
      select: { id: true, title: true, slug: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const [grouped, failures] = await Promise.all([
      this.prisma.registrationFunnelEvent.groupBy({
        by: ['step', 'status'],
        where: { eventId },
        _count: { _all: true },
      }),
      this.prisma.registrationFunnelEvent.findMany({
        where: { eventId, status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          step: true,
          status: true,
          email: true,
          sessionId: true,
          createdAt: true,
          metadata: true,
          referrer: true,
        },
      }),
    ]);

    const trackedSteps = [
      'event_page_viewed',
      'register_cta_clicked',
      'email_submitted',
      'otp_send_requested',
      'otp_sent',
      'otp_verified',
      'profile_completed',
      'ticket_selection_started',
      'payment_started',
      'payment_submitted',
      'registration_submitted_for_review',
      'ticket_issued',
    ];

    const counts = trackedSteps.map((step) => {
      const rows = grouped.filter((g) => g.step === step);
      const total = rows.reduce((sum, row) => sum + row._count._all, 0);
      const success = rows
        .filter((r) => r.status === 'success')
        .reduce((sum, row) => sum + row._count._all, 0);
      const started = rows
        .filter((r) => r.status === 'started')
        .reduce((sum, row) => sum + row._count._all, 0);
      const failed = rows
        .filter((r) => r.status === 'failed' || r.status === 'blocked')
        .reduce((sum, row) => sum + row._count._all, 0);
      return { step, total, success, started, failed };
    });

    return {
      event: { id: event.id, title: event.title, slug: event.slug },
      counts,
      failures: failures.map((f) => ({
        step: f.step,
        status: f.status,
        email: f.email,
        sessionId: f.sessionId,
        referrer: f.referrer,
        metadata: f.metadata,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  // ── Fraud Flags ────────────────────────────────────────────────────────

  async getFraudFlags(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, flags] = await Promise.all([
      this.prisma.fraudFlag.count({ where: { resolvedAt: null } }),
      this.prisma.fraudFlag.findMany({
        where: { resolvedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          order: { select: { id: true, status: true, total: true } },
        },
      }),
    ]);

    return {
      data: flags.map((f: (typeof flags)[number]) => ({
        id: f.id,
        userId: f.userId,
        userEmail: f.user?.email,
        userName: f.user ? `${f.user.firstName} ${f.user.lastName}` : null,
        orderId: f.orderId,
        orderStatus: f.order?.status,
        reason: f.reason,
        ipAddress: f.ipAddress,
        createdAt: f.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async resolveFraudFlag(flagId: string) {
    return this.prisma.fraudFlag.update({
      where: { id: flagId },
      data: { resolvedAt: new Date() },
    });
  }

  // ── Manual Payment Confirmation ────────────────────────────────────────

  async manualConfirmPayment(orderId: string, user: JwtPayload) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...(!user.isAdmin ? { event: this.eventOwnerWhere(user) } : {}) },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') throw new BadRequestException('Order is already paid');

    // Reuse the same confirmPayment logic (generates QR tickets + sends email)
    await this.ordersService.confirmPayment(orderId, `manual:${user.sub}`);

    // Record audit trail
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        confirmedByAdminId: user.sub,
        confirmedAt: new Date(),
      },
    });

    this.logger.log({ msg: 'Order manually confirmed by admin', orderId, adminId: user.sub });
    return { confirmed: true, orderId };
  }

  // ── CSV Exports ─────────────────────────────────────────────────────────

  /**
   * Sanitize a CSV cell value to prevent formula injection (OWASP CSV injection).
   * Prefixes values that start with formula-triggering characters with a tab.
   */
  private escapeCsvCell(value: string): string {
    if (/^[=+\-@\t\r]/.test(value)) return `\t${value}`;
    return value;
  }

  async exportOrders(user: JwtPayload, eventId?: string): Promise<string> {
    if (eventId) await this.assertEventAccess(eventId, user);
    const ownershipFilter = !user.isAdmin ? { event: this.eventOwnerWhere(user) } : {};
    const [orders, registrations] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...(eventId ? { eventId } : {}), ...ownershipFilter },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true, company: true, jobTitle: true, city: true } },
          event: { select: { title: true } },
          items: { include: { ticketTier: { select: { name: true } } } },
        },
      }),
      this.prisma.registration.findMany({
        where: {
          ...(eventId ? { eventId } : {}),
          ...ownershipFilter,
          status: 'verified',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true, company: true, jobTitle: true, city: true } },
          event: { select: { title: true } },
          attendees: {
            where: { isLead: true },
            take: 1,
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    const header = 'Source,Reference,Event,Buyer Name,Email,Company,Job Title,City,Status,Tier,Qty,Subtotal (PHP),Discount (PHP),Referral Code,Total (PHP),Payment Method,Created At\n';

    const orderRows = orders.map((o: (typeof orders)[number]) => {
      const tierNames = o.items.map((i: (typeof o.items)[number]) => `${i.ticketTier.name} x${i.quantity}`).join(' | ');
      const qty = o.items.reduce((sum: number, i: (typeof o.items)[number]) => sum + i.quantity, 0);
      return [
        'Online',
        o.id,
        `"${this.escapeCsvCell(o.event.title)}"`,
        `"${this.escapeCsvCell(`${o.user.firstName} ${o.user.lastName}`)}"`,
        this.escapeCsvCell(o.user.email),
        `"${this.escapeCsvCell(o.user.company ?? '')}"`,
        `"${this.escapeCsvCell(o.user.jobTitle ?? '')}"`,
        `"${this.escapeCsvCell(o.user.city ?? '')}"`,
        o.status,
        `"${this.escapeCsvCell(tierNames)}"`,
        qty,
        Number(o.subtotal).toFixed(2),
        '0.00',
        '',
        Number(o.total).toFixed(2),
        o.paymentMethod ?? '',
        o.createdAt.toISOString(),
      ].join(',');
    });

    const regRows = registrations.map((r: any) => {
      const lead = r.attendees[0];
      const buyerName = lead
        ? `${lead.firstName} ${lead.lastName}`
        : r.user
          ? `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim()
          : 'Walk-in attendee';
      return [
        'Manual (GCash/Bank)',
        this.escapeCsvCell(r.referenceNumber),
        `"${this.escapeCsvCell(r.event.title)}"`,
        `"${this.escapeCsvCell(buyerName)}"`,
        this.escapeCsvCell(lead?.email ?? r.user?.email ?? ''),
        `"${this.escapeCsvCell(r.user?.company ?? '')}"`,
        `"${this.escapeCsvCell(r.user?.jobTitle ?? '')}"`,
        `"${this.escapeCsvCell(r.user?.city ?? '')}"`,
        'paid',
        `"${this.escapeCsvCell(r.tierName ?? 'Registration')}"`,
        r.attendeeCount,
        Number(r.subtotal).toFixed(2),
        Number(r.discount).toFixed(2),
        this.escapeCsvCell((r.referralCodeSnapshot as any)?.code ?? ''),
        Number(r.total).toFixed(2),
        r.paymentMethod ?? '',
        r.createdAt.toISOString(),
      ].join(',');
    });

    // Merge and sort by date desc
    type CsvRow = { createdAt: Date; row: string };
    const merged: CsvRow[] = [
      ...orders.map((o: any, i: number) => ({ createdAt: o.createdAt, row: orderRows[i] })),
      ...registrations.map((r: any, i: number) => ({ createdAt: r.createdAt, row: regRows[i] })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return header + merged.map((m) => m.row).join('\n');
  }

  async exportAttendees(eventId: string): Promise<string> {
    // ── Path A: Registration flow (Attendee records from verified registrations) ──
    const attendees = await this.prisma.attendee.findMany({
      where: { registration: { eventId, status: 'verified' } },
      orderBy: { createdAt: 'asc' },
      include: {
        registration: {
          select: {
            tierName: true,
            paymentMethod: true,
            status: true,
            discount: true,
            referralCodeSnapshot: true,
            user: { select: { city: true } },
          },
        },
      },
    });

    // ── Path B: Online order flow (Ticket records from paid orders) ──────────
    const tickets = await this.prisma.ticket.findMany({
      where: { eventId, status: { in: ['valid', 'used'] } },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, company: true, jobTitle: true, city: true, phone: true } },
        ticketTier: { select: { name: true } },
        order: { select: { status: true, paymentMethod: true } },
      },
    });

    const header = 'ID,Name,Email,Phone,Company,Job Title,Birthday,Gender,City,Tier,Sub Events,Payment Status,Payment Method,Discount (PHP),Referral Code,Checked In,Checked In At\n';

    const attendeeRows = attendees.map((a) => {
      const referralCode = (a.registration.referralCodeSnapshot as { code?: string } | null)?.code ?? '';
      return [
        a.id,
        `"${this.escapeCsvCell(`${a.firstName} ${a.lastName}`)}"`,
        this.escapeCsvCell(a.email ?? ''),
        this.escapeCsvCell(a.phone ?? ''),
        `"${this.escapeCsvCell(a.company ?? '')}"`,
        `"${this.escapeCsvCell(a.jobTitle ?? '')}"`,
        a.birthday?.toISOString().slice(0, 10) ?? '',
        this.escapeCsvCell(a.gender ?? ''),
        `"${this.escapeCsvCell(a.city ?? a.registration.user?.city ?? '')}"`,
        `"${this.escapeCsvCell(a.registration.tierName ?? 'Registration')}"`,
        `"${this.escapeCsvCell(this.formatSelectedSubEvents(a.selectedSubEvents, a.subEventTitle, a.subEventTime) ?? '')}"`,
        a.registration.status === 'verified' ? 'paid' : 'pending',
        this.escapeCsvCell(a.registration.paymentMethod ?? ''),
        Number(a.registration.discount).toFixed(2),
        this.escapeCsvCell(referralCode),
        a.checkedInAt ? 'Yes' : 'No',
        a.checkedInAt?.toISOString() ?? '',
      ].join(',');
    });

    const ticketRows = tickets.map((t) => [
      t.id,
      `"${this.escapeCsvCell(`${t.user.firstName} ${t.user.lastName}`)}"`,
      this.escapeCsvCell(t.user.email),
      this.escapeCsvCell(t.user.phone ?? ''),
      `"${this.escapeCsvCell(t.user.company ?? '')}"`,
      `"${this.escapeCsvCell(t.user.jobTitle ?? '')}"`,
      '',
      '',
      `"${this.escapeCsvCell(t.user.city ?? '')}"`,
      `"${this.escapeCsvCell(t.ticketTier.name)}"`,
      '',
      t.order?.status ?? '',
      t.order?.paymentMethod ?? '',
      t.status === 'used' ? 'Yes' : 'No',
      t.checkedInAt?.toISOString() ?? '',
    ].join(','));

    return header + [...attendeeRows, ...ticketRows].join('\n');
  }

  async generateNametagsPdf(eventId: string, attendeeIds?: string[]): Promise<Buffer> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { title: true, startsAt: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const selectedIds = [...new Set((attendeeIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const idFilter = selectedIds.length > 0 ? { id: { in: selectedIds } } : {};

    const [attendees, tickets] = await Promise.all([
      this.prisma.attendee.findMany({
        where: {
          ...idFilter,
          registration: { eventId, status: 'verified' },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          registration: {
            select: {
              tierName: true,
              tier: {
                select: {
                  name: true,
                  inclusions: {
                    where: { stubEnabled: true },
                    orderBy: { sortOrder: 'asc' },
                    select: { label: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: {
          ...idFilter,
          eventId,
          status: { in: ['valid', 'used'] },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              company: true,
              jobTitle: true,
            },
          },
          ticketTier: {
            select: {
              name: true,
              inclusions: {
                where: { stubEnabled: true },
                orderBy: { sortOrder: 'asc' },
                select: { label: true },
              },
            },
          },
        },
      }),
    ]);

    const rows: NametagRow[] = [
      ...attendees.map((a) => ({
        id: a.id,
        name: this.compactName(a.firstName, a.lastName),
        company: a.company?.trim() ?? '',
        position: a.jobTitle?.trim() ?? '',
        tierName: a.registration.tier?.name ?? a.registration.tierName ?? '',
        inclusions: (a.registration.tier?.inclusions ?? []).map((item) => item.label),
        createdAt: a.createdAt,
      })),
      ...tickets.map((t) => ({
        id: t.id,
        name: this.compactName(t.user.firstName, t.user.lastName),
        company: t.user.company?.trim() ?? '',
        position: t.user.jobTitle?.trim() ?? '',
        tierName: t.ticketTier.name,
        inclusions: t.ticketTier.inclusions.map((item) => item.label),
        createdAt: t.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (selectedIds.length > 0 && rows.length === 0) {
      throw new BadRequestException('No matching attendees found for this event');
    }

    try {
      const eventDate = event.startsAt
        ? event.startsAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
      return await this.renderNametagsPdf(event.title, eventDate, rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Nametag PDF generation failed: ${message}`, stack);
      throw error;
    }
  }

  // ── PDF rendering helpers ─────────────────────────────────────────────────

  private mmToPt(mm: number): number {
    return (mm * 72) / 25.4;
  }

  private async renderNametagsPdf(
    eventTitle: string,
    eventDate: string | null,
    rows: NametagRow[],
  ): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${eventTitle} — Nametags & Stubs`);
    pdf.setAuthor('Axon Tickets');

    const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageW = 595.28;
    const pageH = 841.89;
    const marginX = this.mmToPt(3.5);
    const marginY = this.mmToPt(5);
    const cols = 3;
    const colGap = this.mmToPt(2);
    const rowGap = this.mmToPt(2);
    const stripW = (pageW - 2 * marginX - (cols - 1) * colGap) / cols;
    const tagH = this.mmToPt(38);
    const stubH = this.mmToPt(18);

    // Group by tier, preserving insertion order
    const tierOrder: string[] = [];
    const tierGroups = new Map<string, NametagRow[]>();
    const printable = rows.length > 0 ? rows : [{
      id: 'blank', name: '', company: '', position: '',
      tierName: '', inclusions: [], createdAt: new Date(),
    }];

    for (const row of printable) {
      if (!tierGroups.has(row.tierName)) {
        tierOrder.push(row.tierName);
        tierGroups.set(row.tierName, []);
      }
      tierGroups.get(row.tierName)!.push(row);
    }

    let page = pdf.addPage([pageW, pageH]);
    let currentY = pageH - marginY;

    for (const tierKey of tierOrder) {
      const group = tierGroups.get(tierKey)!;
      const stubCount = group[0].inclusions.length;
      const stripH = tagH + stubCount * stubH;

      for (let i = 0; i < group.length; i += cols) {
        if (currentY - stripH < marginY) {
          page = pdf.addPage([pageW, pageH]);
          currentY = pageH - marginY;
        }

        const rowY = currentY - stripH;
        const rowItems = group.slice(i, i + cols);

        rowItems.forEach((row, colIdx) => {
          const x = marginX + colIdx * (stripW + colGap);
          this.drawStrip(page, x, rowY, stripW, tagH, stubH, row, eventTitle, eventDate, regularFont, boldFont);
        });

        currentY = rowY - rowGap;
      }
    }

    return Buffer.from(await pdf.save());
  }

  private drawStrip(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    tagH: number,
    stubH: number,
    row: NametagRow,
    eventTitle: string,
    eventDate: string | null,
    regularFont: PDFFont,
    boldFont: PDFFont,
  ): void {
    const n = row.inclusions.length;
    const totalH = tagH + n * stubH;

    // Fill white background
    page.drawRectangle({ x, y, width, height: totalH, color: rgb(1, 1, 1) });

    // Nametag section (top of strip)
    const nametagY = y + n * stubH;
    this.drawNametagContent(page, x, nametagY, width, tagH, n > 0, row, eventTitle, regularFont, boldFont);

    // Stub sections (below nametag, top-to-bottom)
    for (let i = 0; i < n; i++) {
      const stubBottomY = y + (n - 1 - i) * stubH;
      const hasBelowSep = i < n - 1;
      this.drawStubContent(page, x, stubBottomY, width, stubH, row.name, row.inclusions[i], eventDate, hasBelowSep, regularFont, boldFont);
    }

    this.drawCutOutline(page, x, y, width, totalH);
  }

  private drawNametagContent(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    hasStubsBelow: boolean,
    row: NametagRow,
    eventTitle: string,
    regularFont: PDFFont,
    boldFont: PDFFont,
  ): void {
    const pad = this.mmToPt(2.5);
    const contentW = width - 2 * pad;
    const darkGray = rgb(0.28, 0.29, 0.31);
    const gray88 = rgb(0.86, 0.87, 0.89);

    // Event title - larger and wrapped so it remains readable without truncation.
    const eventText = eventTitle.trim().toUpperCase();
    const eventSize = 7;
    const eventLines = boldFont.widthOfTextAtSize(eventText, eventSize) <= contentW
      ? [eventText]
      : this.findBalancedTwoLineSplit(eventText, boldFont, eventSize, contentW)
        ?? [this.truncateToWidth(eventText, boldFont, eventSize, contentW)];
    const eventLineHeight = 8;
    const eventTop = y + height - pad;
    eventLines.forEach((line, index) => {
      this.drawCenteredText(page, line, {
        x: x + pad,
        y: eventTop - eventSize - index * eventLineHeight,
        width: contentW,
        font: boldFont,
        size: eventSize,
        color: darkGray,
      });
    });

    // Separator line below event title
    const sepY1 = eventTop - eventLines.length * eventLineHeight - 2;
    page.drawLine({ start: { x, y: sepY1 }, end: { x: x + width, y: sepY1 }, color: gray88, thickness: 0.35 });

    // Attendee name - use up to 22 pt, then wrap long names instead of making them tiny.
    const name = row.name ? row.name.trim().toUpperCase() : '';
    const nameMaxWidth = contentW - 4;
    const footerH = 17;
    const detail = [row.position.trim(), row.company.trim()].filter(Boolean).join(' · ');
    const detailSize = detail ? this.fitFontSize(regularFont, detail, contentW, 9, 7) : 9;
    const detailY = y + footerH + 7;
    const nameAreaBottom = detail ? detailY + detailSize + 4 : y + footerH + 5;
    const nameAreaTop = sepY1 - 4;

    let nameLines = name ? [name] : [''];
    let nameSize = 22;
    if (name) {
      nameSize = this.fitFontSize(boldFont, name, nameMaxWidth, 22, 18);
      if (boldFont.widthOfTextAtSize(name, nameSize) > nameMaxWidth) {
        for (let size = 20; size >= 14; size -= 1) {
          const split = this.findBalancedTwoLineSplit(name, boldFont, size, nameMaxWidth);
          if (split) {
            nameLines = split;
            nameSize = size;
            break;
          }
        }
      }
      if (nameLines.length === 1 && boldFont.widthOfTextAtSize(name, nameSize) > nameMaxWidth) {
        nameSize = this.fitFontSize(boldFont, name, nameMaxWidth, 18, 11);
      }
    }

    const nameMid = nameAreaBottom + (nameAreaTop - nameAreaBottom) / 2;
    const nameLineHeight = nameSize * 1.04;
    nameLines.forEach((line, index) => {
      const lineOffset = ((nameLines.length - 1) / 2 - index) * nameLineHeight;
      this.drawCenteredText(page, line, {
        x: x + pad + 2,
        y: nameMid - nameSize * 0.35 + lineOffset,
        width: nameMaxWidth,
        font: boldFont,
        size: nameSize,
        color: rgb(0.03, 0.03, 0.04),
      });
    });

    // Position and company - larger and darker for print visibility.
    if (detail) {
      this.drawCenteredText(page, detail, {
        x: x + pad,
        y: detailY,
        width: contentW,
        font: regularFont,
        size: detailSize,
        color: rgb(0.24, 0.25, 0.27),
      });
    }

    // Footer separator
    const footerSepY = y + footerH;
    page.drawLine({ start: { x, y: footerSepY }, end: { x: x + width, y: footerSepY }, color: gray88, thickness: 0.35 });

    // Tier pill (left footer)
    if (row.tierName) {
      this.drawPill(page, x + pad, y + 3.5, row.tierName, boldFont, 7, false);
    }

    // Reference number (right footer)
    const refNum = `#AX-${row.id.replace(/-/g, '').slice(-5).toUpperCase()}`;
    const refSize = 7;
    const refW = boldFont.widthOfTextAtSize(refNum, refSize);
    page.drawText(refNum, {
      x: x + width - pad - refW, y: y + 5,
      font: boldFont, size: refSize,
      color: rgb(0.32, 0.33, 0.35),
    });

    // Tear line at bottom of nametag (if stubs follow)
    if (hasStubsBelow) {
      this.drawTearLine(page, x, y, width, boldFont);
    }
  }

  private drawStubContent(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    attendeeName: string,
    label: string,
    eventDate: string | null,
    hasSepBelow: boolean,
    regularFont: PDFFont,
    boldFont: PDFFont,
  ): void {
    const pad = this.mmToPt(2.5);
    const contentW = width - 2 * pad;
    const gray55 = rgb(0.55, 0.55, 0.57);

    // Stub type label — tiny gray caps at top
    page.drawText(`${label.toUpperCase()} STUB`, {
      x: x + pad, y: y + height - pad - 5,
      font: boldFont, size: 4.5,
      color: gray55,
    });

    // Attendee name — bold, left-aligned, middle zone
    const nameDisplay = this.truncateToWidth(attendeeName.trim(), boldFont, 8.5, contentW * 0.62);
    const nameY = y + height * 0.48;
    page.drawText(nameDisplay, {
      x: x + pad, y: nameY,
      font: boldFont, size: 8.5,
      color: rgb(0.08, 0.08, 0.1),
    });

    // Date or detail line — small gray below name
    const detail = eventDate ?? '';
    if (detail) {
      page.drawText(detail, {
        x: x + pad, y: nameY - 10,
        font: regularFont, size: 6,
        color: gray55,
      });
    }

    // Label pill — right-aligned, vertically centered
    const pillH = 10;
    const pillY = y + (height - pillH) / 2;
    this.drawPill(page, x + width - pad, pillY, label.toUpperCase(), boldFont, 6, true);

    // Separator below this stub (between stubs)
    if (hasSepBelow) {
      this.drawTearLine(page, x, y, width, boldFont);
    }
  }

  private drawTearLine(page: PDFPage, x: number, y: number, width: number, boldFont: PDFFont): void {
    const dashLen = 3.2;
    const gapLen = 2.2;
    const labelW = 20;
    let cx = x;
    const lineEnd = x + width - labelW - 2;
    while (cx < lineEnd) {
      page.drawLine({
        start: { x: cx, y },
        end: { x: Math.min(cx + dashLen, lineEnd), y },
        color: rgb(0, 0, 0),
        thickness: 0.95,
      });
      cx += dashLen + gapLen;
    }
    page.drawText('CUT', {
      x: x + width - labelW, y: y - 3,
      font: boldFont, size: 5.5,
      color: rgb(0, 0, 0),
    });
  }

  private drawCutOutline(page: PDFPage, x: number, y: number, width: number, height: number): void {
    const color = rgb(0, 0, 0);
    const thickness = 1.2;
    const dashLen = 3;
    const gapLen = 2;

    this.drawDottedLine(page, x, y, x + width, y, color, thickness, dashLen, gapLen);
    this.drawDottedLine(page, x, y + height, x + width, y + height, color, thickness, dashLen, gapLen);
    this.drawDottedLine(page, x, y, x, y + height, color, thickness, dashLen, gapLen);
    this.drawDottedLine(page, x + width, y, x + width, y + height, color, thickness, dashLen, gapLen);
  }

  private drawDottedLine(
    page: PDFPage,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: ReturnType<typeof rgb>,
    thickness: number,
    dashLen: number,
    gapLen: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length <= 0) return;

    const ux = dx / length;
    const uy = dy / length;
    for (let pos = 0; pos < length; pos += dashLen + gapLen) {
      const end = Math.min(pos + dashLen, length);
      page.drawLine({
        start: { x: x1 + ux * pos, y: y1 + uy * pos },
        end: { x: x1 + ux * end, y: y1 + uy * end },
        color,
        thickness,
      });
    }
  }

  private drawPill(
    page: PDFPage,
    x: number,
    y: number,
    text: string,
    font: PDFFont,
    fontSize: number,
    rightAligned: boolean,
  ): void {
    const padH = 3.5;
    const pillH = fontSize + 4;
    const textW = font.widthOfTextAtSize(text, fontSize);
    const pillW = textW + padH * 2;
    const pillX = rightAligned ? x - pillW : x;

    page.drawRectangle({
      x: pillX, y,
      width: pillW, height: pillH,
      color: rgb(0.298, 0.11, 0.745),
    });
    page.drawText(text, {
      x: pillX + padH, y: y + 2.5,
      font, size: fontSize,
      color: rgb(1, 1, 1),
    });
  }

  private fitFontSize(
    font: PDFFont,
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
  ) {
    for (let size = startSize; size >= minSize; size -= 1) {
      if (font.widthOfTextAtSize(text, size) <= maxWidth) return size;
    }
    return minSize;
  }

  private findBalancedTwoLineSplit(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
  ): [string, string] | null {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;

    let best: { lines: [string, string]; score: number } | null = null;
    for (let index = 1; index < words.length; index += 1) {
      const lines: [string, string] = [
        words.slice(0, index).join(' '),
        words.slice(index).join(' '),
      ];
      const widths = lines.map((line) => font.widthOfTextAtSize(line, size));
      if (widths.some((lineWidth) => lineWidth > maxWidth)) continue;

      const score = Math.abs(widths[0] - widths[1]);
      if (!best || score < best.score) best = { lines, score };
    }

    return best?.lines ?? null;
  }

  private drawCenteredText(
    page: PDFPage,
    text: string,
    options: {
      x: number;
      y: number;
      width: number;
      font: PDFFont;
      size: number;
      color: ReturnType<typeof rgb>;
    },
  ) {
    const trimmed = this.truncateToWidth(text.trim(), options.font, options.size, options.width);
    const textWidth = options.font.widthOfTextAtSize(trimmed, options.size);
    page.drawText(trimmed, {
      x: options.x + Math.max((options.width - textWidth) / 2, 0),
      y: options.y,
      font: options.font,
      size: options.size,
      color: options.color,
    });
  }

  private truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}...`, size) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated.trim()}...`;
  }

  private compactName(firstName: string | null, lastName: string | null) {
    return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ');
  }

  private formatSelectedSubEvents(selectedSubEvents: unknown, fallbackTitle?: string | null, fallbackTime?: string | null) {
    if (Array.isArray(selectedSubEvents) && selectedSubEvents.length > 0) {
      const labels = selectedSubEvents
        .map((item: SelectedSubEventSnapshot) => {
          const title = typeof item?.title === 'string' ? item.title.trim() : '';
          if (!title) return '';
          const time = typeof item?.time === 'string' ? item.time.trim() : '';
          return time ? `${time} - ${title}` : title;
        })
        .filter(Boolean);
      if (labels.length > 0) return labels.join(' | ');
    }
    if (!fallbackTitle) return null;
    return fallbackTime ? `${fallbackTime} - ${fallbackTitle}` : fallbackTitle;
  }

  /**
   * Export all registrations for an event (manual payment flow) as CSV.
   * Includes every status so admins have a complete backup before event day.
   */
  async exportRegistrations(eventId: string): Promise<string> {
    const registrations = await this.prisma.registration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        attendees: {
          orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    const header =
      'Reference,First Name,Last Name,Email,Phone,Tier,Qty,Status,Payment Method,Subtotal (PHP),Discount (PHP),Referral Code,Total (PHP),Registered At,Checked In,First Check-In At\n';

    const rows = registrations.map((reg) => {
      const lead = reg.attendees.find((a) => a.isLead) ?? reg.attendees[0];
      const checkedInCount = reg.attendees.filter((a) => a.checkedInAt !== null).length;
      const firstCheckedInAt = reg.attendees
        .filter((a): a is typeof a & { checkedInAt: Date } => a.checkedInAt !== null)
        .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime())[0]
        ?.checkedInAt;
      const referralCode = (reg.referralCodeSnapshot as { code?: string } | null)?.code ?? '';

      return [
        this.escapeCsvCell(reg.referenceNumber),
        `"${this.escapeCsvCell(lead?.firstName ?? '')}"`,
        `"${this.escapeCsvCell(lead?.lastName ?? '')}"`,
        this.escapeCsvCell(lead?.email ?? ''),
        this.escapeCsvCell(lead?.phone ?? ''),
        `"${this.escapeCsvCell(reg.tierName ?? '')}"`,
        reg.attendeeCount,
        reg.status,
        this.escapeCsvCell(reg.paymentMethod ?? ''),
        Number(reg.subtotal).toFixed(2),
        Number(reg.discount).toFixed(2),
        this.escapeCsvCell(referralCode),
        Number(reg.total).toFixed(2),
        reg.createdAt.toISOString(),
        `${checkedInCount}/${reg.attendeeCount}`,
        firstCheckedInAt?.toISOString() ?? '',
      ].join(',');
    });

    return header + rows.join('\n');
  }

  // ── Dashboard Stats ─────────────────────────────────────────────────────

  async getDashboardStats(user: JwtPayload, eventId?: string) {
    // Build an explicit eventId filter so every query uses a direct scalar
    // comparison rather than a relation-based filter, which is unambiguous.
    // For the global dashboard we resolve all completed-event IDs up front;
    // no record from a non-completed event can ever slip through.
    let scopeFilter: { eventId: string } | { eventId: { in: string[] } };

    if (eventId) {
      await this.assertEventAccess(eventId, user);
      scopeFilter = { eventId };
    } else {
      const completedEvents = await this.prisma.event.findMany({
        where: { status: 'completed', ...this.eventOwnerWhere(user) },
        select: { id: true },
      });
      const ids = completedEvents.map((e) => e.id);

      if (ids.length === 0) {
        return {
          totalTicketsSold: 0,
          paidOrders: 0,
          pendingOrders: 0,
          checkedInTickets: 0,
          verifiedRegistrations: 0,
          pendingRegistrations: 0,
          checkedInAttendees: 0,
          totalRegistrations: 0,
          totalCheckedIn: 0,
          grossRevenue: 0,
        };
      }

      scopeFilter = { eventId: { in: ids } };
    }

    const [
      totalTicketsSold,
      paidOrders,
      pendingOrders,
      checkedInTickets,
      orderRevenueAgg,
      verifiedRegistrations,
      pendingRegistrations,
      checkedInAttendees,
      registrationRevenueAgg,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: { ...scopeFilter, status: { in: ['valid', 'used'] } } }),
      this.prisma.order.count({ where: { ...scopeFilter, status: 'paid' } }),
      this.prisma.order.count({ where: { ...scopeFilter, status: 'pending' } }),
      this.prisma.ticket.count({ where: { ...scopeFilter, status: 'used' } }),
      this.prisma.order.aggregate({ where: { ...scopeFilter, status: 'paid' }, _sum: { total: true } }),
      // Registration flow
      this.prisma.registration.count({ where: { ...scopeFilter, status: 'verified' } }),
      this.prisma.registration.count({ where: { ...scopeFilter, status: 'pending_payment' } }),
      this.prisma.attendee.count({
        where: { registration: scopeFilter, checkedInAt: { not: null } },
      }),
      this.prisma.registration.aggregate({
        where: { ...scopeFilter, status: 'verified' },
        _sum: { total: true },
      }),
    ]);

    const grossRevenue =
      Number(orderRevenueAgg._sum.total ?? 0) +
      Number(registrationRevenueAgg._sum.total ?? 0);

    return {
      totalTicketsSold,
      paidOrders,
      pendingOrders,
      checkedInTickets,
      verifiedRegistrations,
      pendingRegistrations,
      checkedInAttendees,
      totalRegistrations: totalTicketsSold + verifiedRegistrations,
      totalCheckedIn: checkedInTickets + checkedInAttendees,
      grossRevenue,
    };
  }

  // ── Organizer Management ────────────────────────────────────────────────

  async listOrganizers(status?: string, page = 1, limit = 20) {
    const VALID_STATUSES = ['pending', 'approved', 'rejected', 'suspended', 'revoked'] as const;
    const safeStatus = status && (VALID_STATUSES as readonly string[]).includes(status)
      ? (status as (typeof VALID_STATUSES)[number])
      : undefined;

    const where = safeStatus ? { approvalStatus: safeStatus as any } : {};
    const skip = (page - 1) * limit;

    const [total, orgs] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          _count: { select: { members: true } },
        },
      }),
    ]);

    return {
      data: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        website: o.website,
        city: o.city,
        approvalStatus: o.approvalStatus,
        rejectionReason: o.rejectionReason,
        createdBy: {
          id: o.createdBy.id,
          email: o.createdBy.email,
          name: `${o.createdBy.firstName ?? ''} ${o.createdBy.lastName ?? ''}`.trim(),
        },
        approvedBy: o.approvedBy
          ? { id: o.approvedBy.id, email: o.approvedBy.email }
          : null,
        approvedAt: o.approvedAt?.toISOString() ?? null,
        rejectedAt: o.rejectedAt?.toISOString() ?? null,
        memberCount: o._count.members,
        createdAt: o.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getOrganizer(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return {
      id: org.id,
      name: org.name,
      description: org.description,
      contactName: org.contactName,
      organizationType: org.organizationType,
      registrationNumber: org.registrationNumber,
      idType: org.idType,
      idNumber: org.idNumber,
      website: org.website,
      facebookUrl: org.facebookUrl,
      phone: org.phone,
      city: org.city,
      approvalStatus: org.approvalStatus,
      rejectionReason: org.rejectionReason,
      createdBy: {
        id: org.createdBy.id,
        email: org.createdBy.email,
        name: `${org.createdBy.firstName ?? ''} ${org.createdBy.lastName ?? ''}`.trim(),
      },
      approvedBy: org.approvedBy
        ? {
            id: org.approvedBy.id,
            email: org.approvedBy.email,
            name: `${org.approvedBy.firstName ?? ''} ${org.approvedBy.lastName ?? ''}`.trim(),
          }
        : null,
      approvedAt: org.approvedAt?.toISOString() ?? null,
      rejectedAt: org.rejectedAt?.toISOString() ?? null,
      members: org.members.map((m) => ({
        id: m.id,
        role: m.role,
        user: {
          id: m.user.id,
          email: m.user.email,
          name: `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim(),
        },
        joinedAt: m.createdAt.toISOString(),
      })),
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }

  async addOrganizerMember(id: string, adminId: string, email: string, role: 'admin' | 'member' = 'admin') {
    const normalizedEmail = email.trim().toLowerCase();
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const user = await this.prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {},
      create: { email: normalizedEmail, isVerified: false },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const member = await this.prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: id } },
      update: { role },
      create: { userId: user.id, organizationId: id, role },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    await this.audit.log({
      action: 'ORGANIZER_MEMBER_ADDED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name, memberEmail: normalizedEmail, role },
    });

    return {
      id: member.id,
      role: member.role,
      user: {
        id: member.user.id,
        email: member.user.email,
        name: `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim(),
      },
      joinedAt: member.createdAt.toISOString(),
    };
  }

  async removeOrganizerMember(id: string, memberId: string, adminId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: id },
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
    });
    if (!member) throw new NotFoundException('Organization member not found');
    if (member.role === 'owner') {
      throw new BadRequestException('Owner membership cannot be removed from this panel');
    }

    await this.prisma.organizationMember.delete({ where: { id: memberId } });

    await this.audit.log({
      action: 'ORGANIZER_MEMBER_REMOVED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: member.organization.name, memberEmail: member.user.email, role: member.role },
    });

    return { deleted: true };
  }

  async approveOrganizer(id: string, adminId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        approvalStatus: true,
        name: true,
        createdBy: { select: { email: true, firstName: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.approvalStatus === 'approved') {
      throw new BadRequestException('Organization is already approved');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        approvalStatus: 'approved',
        approvedById: adminId,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
      select: { id: true, name: true, approvalStatus: true, approvedAt: true },
    });

    await this.audit.log({
      action: 'ORGANIZER_APPROVED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name },
    });

    const webUrl = this.config.get<string>('webUrl') ?? 'https://axontickets.online';
    await this.emailService.sendOrganizerApprovedEmail(
      org.createdBy.email,
      org.createdBy.firstName ?? 'there',
      org.name,
      `${webUrl}/auth/organizer?redirect=/become-organizer`,
    );

    return {
      id: updated.id,
      name: updated.name,
      approvalStatus: updated.approvalStatus,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
    };
  }

  async rejectOrganizer(id: string, adminId: string, reason: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        approvalStatus: true,
        name: true,
        createdBy: { select: { email: true, firstName: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.approvalStatus === 'rejected') {
      throw new BadRequestException('Organization is already rejected');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        rejectionReason: reason,
        rejectedAt: new Date(),
        approvedById: null,
        approvedAt: null,
      },
      select: {
        id: true,
        name: true,
        approvalStatus: true,
        rejectedAt: true,
        rejectionReason: true,
      },
    });

    await this.audit.log({
      action: 'ORGANIZER_REJECTED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name, reason },
    });

    const webUrl = this.config.get<string>('webUrl') ?? 'https://axontickets.online';
    await this.emailService.sendOrganizerRejectedEmail(
      org.createdBy.email,
      org.createdBy.firstName ?? 'there',
      org.name,
      reason,
      `${webUrl}/become-organizer?applyAgain=1`,
    );

    return {
      id: updated.id,
      name: updated.name,
      approvalStatus: updated.approvalStatus,
      rejectedAt: updated.rejectedAt?.toISOString() ?? null,
      rejectionReason: updated.rejectionReason,
    };
  }

  async pendingOrganizersCount(): Promise<{ count: number }> {
    const count = await this.prisma.organization.count({
      where: { approvalStatus: 'pending' },
    });
    return { count };
  }

  async suspendOrganizer(id: string, adminId: string, reason?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, approvalStatus: true, name: true, createdBy: { select: { email: true, firstName: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.approvalStatus === 'suspended') throw new BadRequestException('Organization is already suspended');
    if (org.approvalStatus === 'revoked') throw new BadRequestException('Organization is revoked and cannot be suspended');

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { approvalStatus: 'suspended' },
      select: { id: true, name: true, approvalStatus: true },
    });

    await this.audit.log({
      action: 'ORGANIZER_SUSPENDED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name, reason: reason ?? null },
    });

    void this.emailService.sendOrganizerSuspendedEmail(
      org.createdBy.email,
      org.createdBy.firstName ?? 'there',
      org.name,
      reason,
    ).catch((err: unknown) => this.logger.error('Failed to send organizer suspended email', err));

    return { id: updated.id, name: updated.name, approvalStatus: updated.approvalStatus };
  }

  async revokeOrganizer(id: string, adminId: string, reason?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, approvalStatus: true, name: true, createdBy: { select: { email: true, firstName: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.approvalStatus === 'revoked') throw new BadRequestException('Organization is already revoked');

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { approvalStatus: 'revoked' },
      select: { id: true, name: true, approvalStatus: true },
    });

    await this.audit.log({
      action: 'ORGANIZER_REVOKED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name, reason: reason ?? null },
    });

    return { id: updated.id, name: updated.name, approvalStatus: updated.approvalStatus };
  }

  async reinstateOrganizer(id: string, adminId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, approvalStatus: true, name: true, createdBy: { select: { email: true, firstName: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (!['suspended', 'revoked'].includes(org.approvalStatus)) {
      throw new BadRequestException('Organization is not suspended or revoked');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { approvalStatus: 'approved', approvedById: adminId, approvedAt: new Date() },
      select: { id: true, name: true, approvalStatus: true, approvedAt: true },
    });

    await this.audit.log({
      action: 'ORGANIZER_REINSTATED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name },
    });

    const webUrl = this.config.get<string>('webUrl') ?? 'https://axontickets.online';
    void this.emailService.sendOrganizerReinstatedEmail(
      org.createdBy.email,
      org.createdBy.firstName ?? 'there',
      org.name,
      webUrl,
    ).catch((err: unknown) => this.logger.error('Failed to send organizer reinstated email', err));

    return { id: updated.id, name: updated.name, approvalStatus: updated.approvalStatus, approvedAt: updated.approvedAt?.toISOString() ?? null };
  }

  async deleteOrganizer(id: string, adminId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, createdBy: { select: { email: true, firstName: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');

    await this.prisma.organization.delete({ where: { id } });

    await this.audit.log({
      action: 'ORGANIZER_DELETED',
      entityType: 'Organization',
      entityId: id,
      performedById: adminId,
      metadata: { organizationName: org.name },
    });

    void this.emailService.sendOrganizerDeletedEmail(
      org.createdBy.email,
      org.createdBy.firstName ?? 'there',
      org.name,
    ).catch((err: unknown) => this.logger.error('Failed to send organizer deleted email', err));

    return { deleted: true };
  }

  // ── Platform settings ─────────────────────────────────────────────────────

  async getPlatformSettings() {
    const [feeRow] = await Promise.all([
      this.prisma.platformConfig.findUnique({ where: { key: 'service_fee' } }),
    ]);
    return {
      serviceFee: feeRow ? Number(feeRow.value) : 50,
    };
  }

  async updatePlatformSettings(serviceFee: number, adminId: string) {
    await this.prisma.platformConfig.upsert({
      where: { key: 'service_fee' },
      create: { key: 'service_fee', value: String(serviceFee), updatedById: adminId },
      update: { value: String(serviceFee), updatedById: adminId },
    });
    await this.audit.log({ action: 'platform.settings.update', entityType: 'platform', entityId: 'service_fee', performedById: adminId, metadata: { serviceFee } });
    return { serviceFee };
  }
}
