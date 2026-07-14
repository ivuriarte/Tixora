import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateEventDto, OnsiteRegistrationDto, UpdateEventDto } from './dto/event.dto';
import { generateAttendeeQrToken, generateReferenceNumber, uniqueSlug } from '@axon-tickets/utils';

const TIER_INVENTORY_PREFIX = 'ticket_tier:';
const INVENTORY_SUFFIX = ':available';
const ACTIVE_REGISTRATION_STATUSES = ['pending_payment', 'proof_submitted', 'pending_approval', 'verified'] as const;
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
    private readonly config: ConfigService = { get: () => undefined } as unknown as ConfigService,
  ) {}

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

  private validateBirthday(birthdayValue: string): Date {
    const birthday = new Date(`${birthdayValue}T00:00:00.000Z`);
    const today = new Date();
    const earliest = new Date(Date.UTC(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate()));
    if (!Number.isFinite(birthday.getTime()) || birthday > today || birthday < earliest) {
      throw new BadRequestException('Birthday must be a valid past date within the last 120 years.');
    }
    return birthday;
  }

  private async createDailyAttendance(
    tx: Prisma.TransactionClient,
    attendee: { id: string; registrationId: string },
    eventId: string,
    method: string,
    now = new Date(),
  ) {
    const checkInDate = this.checkInDateFor(now);
    try {
      const attendance = await tx.attendeeAttendance.create({
        data: {
          attendeeId: attendee.id,
          registrationId: attendee.registrationId,
          eventId,
          checkInDate,
          checkedInAt: now,
          checkInMethod: method,
        },
      });
      await tx.attendee.updateMany({
        where: { id: attendee.id, checkedInAt: null },
        data: { checkedInAt: now, checkInMethod: method },
      });
      return attendance;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await tx.attendeeAttendance.findFirst({
          where: { attendeeId: attendee.id, eventId, checkInDate },
          select: { checkedInAt: true },
        });
        throw new ConflictException({
          message: 'Already checked in today.',
          checkedInAt: existing?.checkedInAt?.toISOString() ?? null,
        });
      }
      throw error;
    }
  }

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
        isFree: e.isFree,
        lowestPrice: e.isFree ? 0 : e.tiers[0] ? Number(e.tiers[0].price) : null,
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
      onsiteRegistrationEnabled: event.onsiteRegistrationEnabled,
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

  async handleOnsiteRegistrationScan(slug: string, dto: OnsiteRegistrationDto) {
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
    if (!event.onsiteRegistrationEnabled) {
      throw new BadRequestException('On-site registration is not enabled for this event.');
    }
    if (event.status === 'cancelled') {
      throw new BadRequestException('This event is cancelled.');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.attendeeId?.trim()) {
        const attendee = await tx.attendee.findFirst({
          where: {
            id: dto.attendeeId.trim(),
            registration: { eventId: event.id, status: 'verified' },
          },
          include: {
            registration: { select: { id: true, referenceNumber: true, tierName: true } },
          },
        });
        if (!attendee) throw new NotFoundException('Attendee not found for this event.');
        const attendance = await this.createDailyAttendance(tx, attendee, event.id, 'onsite_qr', now);
        return { attendee, registration: attendee.registration, attendance, created: false };
      }

      const email = dto.email?.trim().toLowerCase();
      const firstName = dto.firstName?.trim();
      const lastName = dto.lastName?.trim();
      const phone = dto.contactNumber?.trim();
      const gender = dto.gender?.trim();
      if (!email || !firstName || !lastName || !phone || !gender || !dto.birthday) {
        throw new BadRequestException('Required attendee details are missing.');
      }
      const birthday = this.validateBirthday(dto.birthday);

      const existing = await tx.attendee.findFirst({
        where: {
          registration: {
            eventId: event.id,
            status: { in: ['pending_payment', 'proof_submitted', 'pending_approval', 'verified'] },
          },
          OR: [
            { email: { equals: email, mode: 'insensitive' } },
            {
              firstName: { equals: firstName, mode: 'insensitive' },
              lastName: { equals: lastName, mode: 'insensitive' },
              birthday,
            },
          ],
        },
        include: {
          registration: { select: { id: true, referenceNumber: true, tierName: true, status: true } },
        },
      });

      if (existing) {
        if (existing.registration.status !== 'verified') {
          throw new BadRequestException(
            `This attendee already has a registration with status ${existing.registration.status}. Please ask staff for assistance.`,
          );
        }
        const attendance = await this.createDailyAttendance(tx, existing, event.id, 'onsite_qr', now);
        return { attendee: existing, registration: existing.registration, attendance, created: false };
      }

      const tier = event.tiers.find((item) => item.id === dto.tierId) ?? event.tiers[0];
      if (!tier) throw new BadRequestException('No visible ticket tier is available for on-site registration.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.id}), hashtext(${tier.id}))`;
      const registrationUsage = await tx.registration.aggregate({
        where: {
          tierId: tier.id,
          status: { in: ['pending_payment', 'proof_submitted', 'pending_approval', 'verified'] },
        },
        _sum: { attendeeCount: true },
      });
      const ticketUsage = await tx.ticket.count({
        where: { ticketTierId: tier.id, status: { in: ['valid', 'used'] } },
      });
      const occupied = Number(registrationUsage._sum.attendeeCount ?? 0) + ticketUsage;
      if (tier.totalQuantity - occupied < 1) {
        throw new BadRequestException('No seats are available for this ticket tier.');
      }

      const user = await tx.user.upsert({
        where: { email },
        create: {
          email,
          phone,
          firstName,
          lastName,
          isVerified: true,
          birthday,
          gender,
          company: dto.company?.trim() || null,
          jobTitle: dto.jobTitle?.trim() || null,
        },
        update: {
          phone,
          birthday,
          gender,
          ...(dto.company !== undefined ? { company: dto.company.trim() || null } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle.trim() || null } : {}),
        },
        select: { id: true },
      });

      const unitPrice = event.isFree ? 0 : Number(tier.price);
      const fees = event.isFree ? 0 : Number(event.platformFee ?? 0);
      const registration = await tx.registration.create({
        data: {
          referenceNumber: generateReferenceNumber(),
          userId: user.id,
          eventId: event.id,
          tierId: tier.id,
          tierName: tier.name,
          unitPrice,
          attendeeCount: 1,
          subtotal: unitPrice,
          fees,
          total: unitPrice + fees,
          status: 'verified',
          verifiedAt: now,
          currency: tier.currency,
          paymentMethod: 'onsite_qr',
          notes: 'QR-initiated on-site registration',
          attendees: {
            create: {
              firstName,
              lastName,
              email,
              phone,
              birthday,
              gender,
              company: dto.company?.trim() || null,
              jobTitle: dto.jobTitle?.trim() || null,
              isLead: true,
            },
          },
        },
        include: { attendees: true },
      });

      await tx.ticketTier.update({
        where: { id: tier.id },
        data: { soldQuantity: occupied + 1 },
      });

      const attendee = registration.attendees[0];
      const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';
      const qrToken = generateAttendeeQrToken(
        { attendeeId: attendee.id, registrationId: registration.id, eventId: event.id },
        qrSecret,
      );
      const updatedAttendee = await tx.attendee.update({
        where: { id: attendee.id },
        data: { qrToken },
      });
      const attendance = await this.createDailyAttendance(tx, updatedAttendee, event.id, 'onsite_qr', now);
      return {
        attendee: updatedAttendee,
        registration: {
          id: registration.id,
          referenceNumber: registration.referenceNumber,
          tierName: registration.tierName,
        },
        attendance,
        created: true,
      };
    });

    return {
      created: result.created,
      attendee: {
        id: result.attendee.id,
        firstName: result.attendee.firstName,
        lastName: result.attendee.lastName,
        email: result.attendee.email,
      },
      registration: {
        id: result.registration.id,
        referenceNumber: result.registration.referenceNumber,
        tierName: result.registration.tierName,
      },
      attendance: {
        id: result.attendance.id,
        checkInDate: result.attendance.checkInDate.toISOString().slice(0, 10),
        checkedInAt: result.attendance.checkedInAt.toISOString(),
      },
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
        ...(dto.onsiteRegistrationEnabled !== undefined && { onsiteRegistrationEnabled: dto.onsiteRegistrationEnabled }),
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
        ...(dto.onsiteRegistrationEnabled !== undefined && { onsiteRegistrationEnabled: dto.onsiteRegistrationEnabled }),
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
        isFree: e.isFree,
        lowestPrice: e.isFree ? 0 : e.tiers[0] ? Number(e.tiers[0].price) : null,
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
