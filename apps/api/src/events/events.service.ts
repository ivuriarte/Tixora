import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { uniqueSlug } from '@axon-tickets/utils';

const TIER_INVENTORY_PREFIX = 'ticket_tier:';
const INVENTORY_SUFFIX = ':available';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
            select: { price: true, soldQuantity: true, totalQuantity: true },
            orderBy: { price: 'asc' },
          },
        },
      }),
    ]);

    const data = events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      venue: e.venue,
      city: e.city,
      startsAt: e.startsAt.toISOString(),
      imageUrl: e.imageUrl,
      status: e.status,
      lowestPrice: e.tiers[0] ? Number(e.tiers[0].price) : null,
      totalAvailable: e.tiers.reduce(
        (sum: number, t) => sum + Math.max(0, t.totalQuantity - t.soldQuantity),
        0,
      ),
    }));

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
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Batch fetch all tier inventory counts in a single Redis MGET round-trip
    const inventoryKeys = event.tiers.map((t) => `${TIER_INVENTORY_PREFIX}${t.id}${INVENTORY_SUFFIX}`);
    const cachedValues = await this.redis.mget(inventoryKeys);

    const tiersWithAvailable = event.tiers.map((tier, i) => {
      const cached = cachedValues[i];
      const availableQuantity =
        cached !== null
          ? parseInt(cached, 10)
          : Math.max(0, tier.totalQuantity - tier.soldQuantity);

      return {
        id: tier.id,
        eventId: tier.eventId,
        name: tier.name,
        description: tier.description,
        price: Number(tier.price),
        currency: tier.currency,
        totalQuantity: tier.totalQuantity,
        soldQuantity: tier.soldQuantity,
        availableQuantity,
        maxPerOrder: tier.maxPerOrder,
        saleStartsAt: tier.saleStartsAt?.toISOString() ?? null,
        saleEndsAt: tier.saleEndsAt?.toISOString() ?? null,
        isVisible: tier.isVisible,
        sortOrder: tier.sortOrder,
        isSoldOut: availableQuantity <= 0,
      };
    });

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
      allowManualPayment: event.allowManualPayment,
      bankName: event.bankName ?? null,
      bankAccountNumber: event.bankAccountNumber ?? null,
      bankAccountName: event.bankAccountName ?? null,
      gcashNumber: event.gcashNumber ?? null,
      paymentMethods: event.paymentMethods ?? null,
      tiers: tiersWithAvailable,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async create(dto: CreateEventDto, createdById: string) {
    const slug = uniqueSlug(dto.title);
    return this.prisma.event.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        address: dto.address ?? null,
        landmark: dto.landmark ?? null,
        city: dto.city ?? 'Manila',
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        maxPerUser: dto.maxPerUser ?? 4,
        ...(dto.maxCapacity !== undefined && { maxCapacity: dto.maxCapacity }),
        speakerName: dto.speakerName ?? null,
        agenda: (dto.agenda as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        sponsors: (dto.sponsors as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        faqs: (dto.faqs as unknown as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        ...(dto.platformFee !== undefined && { platformFee: dto.platformFee }),
        ...(dto.imageUrl && { imageUrl: dto.imageUrl }),
        ...(dto.allowManualPayment !== undefined && { allowManualPayment: dto.allowManualPayment }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber }),
        ...(dto.bankAccountName !== undefined && { bankAccountName: dto.bankAccountName }),
        ...(dto.gcashNumber !== undefined && { gcashNumber: dto.gcashNumber }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark }),
        ...(dto.paymentMethods !== undefined && { paymentMethods: (dto.paymentMethods as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        createdById,
      },
    });
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
        ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
        ...(dto.maxPerUser && { maxPerUser: dto.maxPerUser }),
        ...(dto.maxCapacity !== undefined && { maxCapacity: dto.maxCapacity }),
        ...(dto.status && { status: dto.status as any }),
        ...(dto.speakerName !== undefined && { speakerName: dto.speakerName }),
        ...(dto.agenda !== undefined && { agenda: (dto.agenda as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.sponsors !== undefined && { sponsors: (dto.sponsors as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.faqs !== undefined && { faqs: (dto.faqs as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
        ...(dto.platformFee !== undefined && { platformFee: dto.platformFee }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.allowManualPayment !== undefined && { allowManualPayment: dto.allowManualPayment }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber }),
        ...(dto.bankAccountName !== undefined && { bankAccountName: dto.bankAccountName }),
        ...(dto.gcashNumber !== undefined && { gcashNumber: dto.gcashNumber }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark }),
        ...(dto.paymentMethods !== undefined && { paymentMethods: (dto.paymentMethods as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull }),
      },
    });
  }

  async findById(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Seed Redis inventory for a tier when it goes on sale */
  async seedTierInventory(tierId: string, quantity: number): Promise<void> {
    const key = `${TIER_INVENTORY_PREFIX}${tierId}${INVENTORY_SUFFIX}`;
    await this.redis.set(key, quantity.toString());
  }
}
