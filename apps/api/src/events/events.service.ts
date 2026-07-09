import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { uniqueSlug } from '@axon-tickets/utils';

const TIER_INVENTORY_PREFIX = 'ticket_tier:';
const INVENTORY_SUFFIX = ':available';
const ACTIVE_REGISTRATION_STATUSES = ['pending_payment', 'proof_submitted', 'verified'] as const;
const VALID_TICKET_STATUSES = ['valid', 'used'] as const;

type TierInventory = {
  id: string;
  totalQuantity: number;
  soldQuantity?: number;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /**
   * Auto-set expired on_sale/sold_out events to completed. Called on listing.
   * Only completes when there is a definitive end time in the past:
   *  - endsAt is set and in the past, OR
   *  - endsAt is null but startsAt was more than 24h ago (grace window for single-day events).
   */
  async autoCompleteExpiredEvents() {
    const now = new Date();
    const graceCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await this.prisma.event.updateMany({
      where: {
        status: { in: ['on_sale', 'sold_out'] as any[] },
        OR: [
          { endsAt: { lt: now } },
          { endsAt: null, startsAt: { lt: graceCutoff } },
        ],
      },
      data: { status: 'completed' as any },
    });
  }

  async findAll(page = 1, limit = 20) {
    await this.autoCompleteExpiredEvents();
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;
    const where: Prisma.EventWhereInput = {
      status: 'on_sale' as any,
    };

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { startsAt: 'asc' },
        include: {
          tiers: {
            where: { isVisible: true },
            select: { id: true, price: true, soldQuantity: true, totalQuantity: true },
            orderBy: { price: 'asc' },
          },
        },
      }),
    ]);

    const tiersByEvent = await Promise.all(
      events.map((e) => this.withLiveInventory(e.tiers)),
    );

    const data = events.map((e, index) => {
      const tiers = tiersByEvent[index];
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        venue: e.venue,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        imageUrl: e.imageUrl,
        status: e.status,
        lowestPrice: e.tiers[0] ? Number(e.tiers[0].price) : null,
        totalAvailable: tiers.reduce(
          (sum: number, t) => sum + t.availableQuantity,
          0,
        ),
      };
    });

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNextPage: safePage * safeLimit < total,
        hasPrevPage: safePage > 1,
      },
    };
  }

  async findBySlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        tiers: {
          where: { isVisible: true },
          include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    const tiersWithAvailable = (await this.withLiveInventory(event.tiers)).map(
      (tier) => ({
        id: tier.id,
        eventId: tier.eventId,
        name: tier.name,
        description: tier.description,
        price: event.isFree ? 0 : Number(tier.price),
        currency: tier.currency,
        totalQuantity: tier.totalQuantity,
        soldQuantity: tier.soldQuantity,
        availableQuantity: tier.availableQuantity,
        maxPerOrder: tier.maxPerOrder,
        saleStartsAt: tier.saleStartsAt?.toISOString() ?? null,
        saleEndsAt: tier.saleEndsAt?.toISOString() ?? null,
        isVisible: tier.isVisible,
        sortOrder: tier.sortOrder,
        isSoldOut: tier.availableQuantity <= 0,
        inclusions: tier.inclusions.map((item) => ({
          id: item.id,
          label: item.label,
          stubEnabled: item.stubEnabled,
          sortOrder: item.sortOrder,
        })),
      }),
    );

    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      venue: event.venue,
      address: event.address ?? null,
      city: event.city,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      imageUrl: event.imageUrl,
      status: event.status,
      maxPerUser: event.maxPerUser,
      maxCapacity: event.maxCapacity ?? null,
      speakerName: event.speakerName ?? null,
      sponsors: event.sponsors ?? null,
      agenda: event.agenda ?? null,
      faqs: event.faqs ?? null,
      customSections: event.customSections ?? null,
      allowManualPayment: event.allowManualPayment,
      bankName: event.bankName ?? null,
      bankAccountNumber: event.bankAccountNumber ?? null,
      bankAccountName: event.bankAccountName ?? null,
      gcashNumber: event.gcashNumber ?? null,
      paymentMethods: event.paymentMethods ?? null,
      isFree: event.isFree,
      platformFee: Number(event.platformFee ?? 50),
      landmark: event.landmark ?? null,
      latitude: event.latitude ? Number(event.latitude) : null,
      longitude: event.longitude ? Number(event.longitude) : null,
      tiers: tiersWithAvailable,
      organizerName: event.organization?.name ?? null,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async create(dto: CreateEventDto, createdById: string, organizationId?: string) {
    const slug = uniqueSlug(dto.title);
    const platformFee = dto.isFree
      ? 0
      : dto.platformFee !== undefined
      ? dto.platformFee
      : await this.prisma.platformConfig.findUnique({ where: { key: 'service_fee' } }).then((r) => (r ? Number(r.value) : 50));
    const event = await this.prisma.event.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        address: dto.address ?? null,
        landmark: dto.landmark ?? null,
        city: dto.city ?? 'Manila',
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        maxPerUser: dto.maxPerUser ?? 4,
        ...(dto.maxCapacity !== undefined && { maxCapacity: dto.maxCapacity }),
        speakerName: dto.speakerName ?? null,
        agenda: (dto.agenda as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        sponsors: (dto.sponsors as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        faqs: (dto.faqs as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        customSections: (dto.customSections as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        isFree: dto.isFree ?? false,
        platformFee,
        ...(dto.imageUrl && { imageUrl: dto.imageUrl }),
        ...(dto.allowManualPayment !== undefined && { allowManualPayment: dto.allowManualPayment }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber }),
        ...(dto.bankAccountName !== undefined && { bankAccountName: dto.bankAccountName }),
        ...(dto.gcashNumber !== undefined && { gcashNumber: dto.gcashNumber }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark }),
        ...(dto.paymentMethods !== undefined && { paymentMethods: (dto.paymentMethods as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        createdById,
        ...(organizationId ? { organizationId } : {}),
      },
    });

    // Auto-create workspace — fire-and-forget; never fails event creation
    this.workspaces.ensureWorkspace(event.id, createdById).catch(() => void 0);

    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.findById(id);
    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.venue && { venue: dto.venue }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city && { city: dto.city }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
        ...(dto.maxPerUser && { maxPerUser: dto.maxPerUser }),
        ...(dto.maxCapacity !== undefined && { maxCapacity: dto.maxCapacity }),
        ...(dto.status && { status: dto.status as any }),
        ...(dto.speakerName !== undefined && { speakerName: dto.speakerName }),
        ...(dto.agenda !== undefined && { agenda: (dto.agenda as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.sponsors !== undefined && { sponsors: (dto.sponsors as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.faqs !== undefined && { faqs: (dto.faqs as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.customSections !== undefined && { customSections: (dto.customSections as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.isFree !== undefined && { isFree: dto.isFree }),
        ...(dto.isFree === true
          ? { platformFee: 0 }
          : dto.platformFee !== undefined
          ? { platformFee: dto.platformFee }
          : {}),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.allowManualPayment !== undefined && { allowManualPayment: dto.allowManualPayment }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber }),
        ...(dto.bankAccountName !== undefined && { bankAccountName: dto.bankAccountName }),
        ...(dto.gcashNumber !== undefined && { gcashNumber: dto.gcashNumber }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark }),
        ...(dto.paymentMethods !== undefined && { paymentMethods: (dto.paymentMethods as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.featuredOrder !== undefined && { featuredOrder: dto.featuredOrder }),
        ...(dto.featuredUntil !== undefined && { featuredUntil: dto.featuredUntil ? new Date(dto.featuredUntil) : null }),
      },
    });
  }

  async findById(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /**
   * Returns up to 10 currently-featured events ordered by featuredOrder ASC.
   * Excludes events where featuredUntil is set and in the past.
   */
  async findFeatured() {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: {
        isFeatured: true,
        status: { in: ['on_sale', 'sold_out'] as any[] },
        OR: [
          { featuredUntil: null },
          { featuredUntil: { gt: now } },
        ],
      },
      orderBy: [
        { featuredOrder: { sort: 'asc', nulls: 'last' } },
        { startsAt: 'asc' },
      ],
      take: 10,
      include: {
        tiers: {
          where: { isVisible: true },
          select: { id: true, price: true, soldQuantity: true, totalQuantity: true },
          orderBy: { price: 'asc' },
        },
      },
    });

    const tiersByEvent = await Promise.all(
      events.map((e) => this.withLiveInventory(e.tiers)),
    );

    return events.map((e, index) => {
      const tiers = tiersByEvent[index];
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        description: e.description,
        speakerName: e.speakerName,
        tagline: e.tagline,
        venue: e.venue,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt ? e.endsAt.toISOString() : null,
        imageUrl: e.imageUrl,
        status: e.status,
        maxCapacity: e.maxCapacity,
        featuredOrder: e.featuredOrder,
        lowestPrice: e.tiers[0] ? Number(e.tiers[0].price) : null,
        totalAvailable: tiers.reduce(
          (sum: number, t) => sum + t.availableQuantity,
          0,
        ),
      };
    });
  }

  /** Seed Redis inventory for a tier when it goes on sale */
  async seedTierInventory(tierId: string, quantity: number): Promise<void> {
    const key = `${TIER_INVENTORY_PREFIX}${tierId}${INVENTORY_SUFFIX}`;
    await this.redis.set(key, quantity.toString());
  }

  async withLiveInventory<T extends TierInventory>(tiers: T[]): Promise<Array<T & {
    soldQuantity: number;
    availableQuantity: number;
    isSoldOut: boolean;
  }>> {
    if (tiers.length === 0) return [];

    const tierIds = tiers.map((tier) => tier.id);
    const usage = await this.getTierUsage(tierIds);

    return tiers.map((tier) => {
      const soldQuantity = usage.get(tier.id) ?? 0;
      const availableQuantity = Math.max(0, tier.totalQuantity - soldQuantity);
      return {
        ...tier,
        soldQuantity,
        availableQuantity,
        isSoldOut: availableQuantity <= 0,
      };
    });
  }

  async getTierUsage(tierIds: string[]): Promise<Map<string, number>> {
    const usage = new Map<string, number>();
    if (tierIds.length === 0) return usage;

    const [registrations, tickets] = await Promise.all([
      this.prisma.registration.groupBy({
        by: ['tierId'],
        where: {
          tierId: { in: tierIds },
          status: { in: [...ACTIVE_REGISTRATION_STATUSES] as any[] },
        },
        _sum: { attendeeCount: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['ticketTierId'],
        where: {
          ticketTierId: { in: tierIds },
          status: { in: [...VALID_TICKET_STATUSES] as any[] },
        },
        _count: { id: true },
      }),
    ]);

    for (const row of registrations) {
      if (row.tierId) {
        usage.set(row.tierId, Number(row._sum.attendeeCount ?? 0));
      }
    }

    for (const row of tickets) {
      if (row.ticketTierId) {
        const current = usage.get(row.ticketTierId) ?? 0;
        const count = typeof row._count === 'object' ? (row._count.id ?? 0) : 0;
        usage.set(row.ticketTierId, current + count);
      }
    }

    return usage;
  }
}
