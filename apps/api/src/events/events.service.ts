import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateEventDto, OnsiteProfileSuggestionDto, OnsiteRegistrationDto, UpdateEventDto } from './dto/event.dto';
import { resolveAgendaSubEvent } from './agenda-sub-events';
import { generateAttendeeQrToken, generateReferenceNumber, uniqueSlug } from '@axon-tickets/utils';

const TIER_INVENTORY_PREFIX = 'ticket_tier:';
const INVENTORY_SUFFIX = ':available';
const ACTIVE_REGISTRATION_STATUSES = ['pending_payment', 'proof_submitted', 'pending_approval', 'verified'] as const;
const VALID_TICKET_STATUSES = ['valid', 'used'] as const;
const ONSITE_DUPLICATE_REGISTRATION_MESSAGE =
  'You have already successfully registered for this event. You cannot register twice for the same event.';
const CUSTOMER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TierInventory = {
  id: string;
  totalQuantity: number;
  soldQuantity?: number;
};

type SelectedSubEvent = {
  id: string;
  title: string;
  time?: string;
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

  private readableStatus(status: string) {
    return status.replace(/_/g, ' ');
  }

  private canonicalWebUrl() {
    const configured = this.config.get<string>('webUrl') || '';
    const appEnv = this.config.get<string>('appEnv') || 'production';
    if (configured.includes('tixora-online-ticket-app.vercel.app')) {
      return appEnv === 'uat' ? 'https://uat.axontickets.online' : 'https://axontickets.online';
    }
    return (configured || (appEnv === 'uat' ? 'https://uat.axontickets.online' : 'https://axontickets.online')).replace(/\/$/, '');
  }

  private onsiteUrl(slug: string, eventId?: string) {
    const onsiteUrl = `${this.canonicalWebUrl()}/events/${slug}/onsite`;
    return eventId ? `${onsiteUrl}?eventId=${encodeURIComponent(eventId)}` : onsiteUrl;
  }

  private eventWhereForQr(slug: string, eventId?: string): Prisma.EventWhereUniqueInput {
    const id = eventId?.trim();
    return id ? { id } : { slug };
  }

  private selectedSubEventsFromAgenda(agenda: Prisma.JsonValue, ids?: string[], fallbackId?: string): SelectedSubEvent[] {
    const requestedIds = [...new Set([...(ids ?? []), fallbackId].filter((id): id is string => Boolean(id?.trim())).map((id) => id.trim()))];
    if (requestedIds.length === 0) return [];

    const resolved = requestedIds.map((id) => resolveAgendaSubEvent(agenda, id));
    const missing = requestedIds.filter((_, index) => !resolved[index]);
    if (missing.length > 0) {
      throw new BadRequestException('One or more selected sub-events are no longer available. Please refresh the form and choose again.');
    }

    return resolved
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        id: item.id,
        title: item.title,
        ...(item.time ? { time: item.time } : {}),
      }));
  }

  private agendaHasSubEvents(agenda: Prisma.JsonValue) {
    return Array.isArray(agenda) && agenda.some((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const candidate = item as Record<string, unknown>;
      return candidate.isSubEvent === true && typeof candidate.id === 'string' && typeof candidate.title === 'string';
    });
  }

  private summarizeSubEvents(items: SelectedSubEvent[]) {
    if (items.length === 0) return null;
    if (items.length === 1) return items[0].time ? `${items[0].time} - ${items[0].title}` : items[0].title;
    return `${items.length} sub-events selected`;
  }

  private async profileSuggestionForName(firstName: string, lastName: string) {
    const attendee = await this.prisma.attendee.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
        email: { not: null },
        registration: {
          status: 'verified',
          paymentMethod: { in: ['onsite_qr', 'walk_in'] },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        birthday: true,
        city: true,
        company: true,
        jobTitle: true,
      },
    });

    if (!attendee?.email) return null;
    return {
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      email: attendee.email,
      contactNumber: attendee.phone ?? '',
      gender: attendee.gender ?? '',
      birthday: attendee.birthday?.toISOString().slice(0, 10) ?? '',
      city: attendee.city ?? '',
      company: attendee.company ?? '',
      jobTitle: attendee.jobTitle ?? '',
      maskedEmail: (attendee.email ?? '').replace(/^(.).+(@.+)$/, '$1***$2'),
    };
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

  async getPublicStats() {
    const [eventsHosted, ticketCheckIns, attendeeCheckIns, verifiedOrganizers] = await Promise.all([
      this.prisma.event.count({ where: { status: { in: ['on_sale', 'sold_out', 'completed'] as any[] } } }),
      this.prisma.ticket.count({ where: { checkedInAt: { not: null } } }),
      this.prisma.attendee.count({ where: { checkedInAt: { not: null } } }),
      this.prisma.organization.count({ where: { approvalStatus: 'approved' } }),
    ]);

    return {
      eventsHosted,
      attendeesCheckedIn: ticketCheckIns + attendeeCheckIns,
      verifiedOrganizers,
    };
  }

  async findAll(page = 1, limit = 20, query?: string) {
    await this.autoCompleteExpiredEvents();
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;
    const q = query?.trim().slice(0, 120);
    const where: Prisma.EventWhereInput = {
      status: 'on_sale' as any,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { venue: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
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

  async findBySlug(slug: string, eventId?: string) {
    const event = await this.prisma.event.findUnique({
      where: this.eventWhereForQr(slug, eventId),
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
      where: this.eventWhereForQr(slug, dto.eventId),
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
    if (event.status !== 'on_sale') {
      throw new BadRequestException(`Registration is not open yet. This event is currently ${this.readableStatus(event.status)}.`);
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

      const emailNotApplicable = dto.emailNotApplicable === true;
      const email = emailNotApplicable ? null : dto.email?.trim().toLowerCase();
      const firstName = dto.firstName?.trim();
      const lastName = dto.lastName?.trim();
      const phone = dto.contactNumber?.trim();
      const gender = dto.gender?.trim();
      const city = dto.city?.trim();
      if ((!emailNotApplicable && !email) || !firstName || !lastName || !phone || !gender || !dto.birthday || !city) {
        throw new BadRequestException('Required attendee details are missing.');
      }
      if (emailNotApplicable && dto.email?.trim()) {
        throw new BadRequestException('Clear the email field when Email is marked Not applicable.');
      }
      if (email && !CUSTOMER_EMAIL_PATTERN.test(email)) {
        throw new BadRequestException('Please enter a valid email address.');
      }
      const birthday = this.validateBirthday(dto.birthday);
      const selectedSubEvents = this.selectedSubEventsFromAgenda(event.agenda, dto.subEventIds, dto.subEventId);
      if (this.agendaHasSubEvents(event.agenda) && selectedSubEvents.length === 0) {
        throw new BadRequestException('Please choose at least one sub-event to attend.');
      }
      const primarySubEvent = selectedSubEvents[0] ?? null;

      const duplicateClauses: Prisma.AttendeeWhereInput[] = [
        ...(email ? [{ email: { equals: email, mode: Prisma.QueryMode.insensitive } }] : []),
        {
          firstName: { equals: firstName, mode: 'insensitive' },
          lastName: { equals: lastName, mode: 'insensitive' },
          birthday,
        },
      ];

      const existing = await tx.attendee.findFirst({
        where: {
          registration: {
            eventId: event.id,
            status: { in: ['pending_payment', 'proof_submitted', 'pending_approval', 'verified'] },
          },
          OR: duplicateClauses,
        },
        include: {
          registration: { select: { id: true, referenceNumber: true, tierName: true, status: true } },
        },
      });

      if (existing) {
        throw new BadRequestException(
          existing.registration.status === 'verified'
            ? ONSITE_DUPLICATE_REGISTRATION_MESSAGE
            : `This attendee already has a registration with status ${existing.registration.status}. Please ask staff for assistance.`,
        );
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

      const user = email
        ? await tx.user.upsert({
            where: { email },
            create: {
              email,
              phone,
              firstName,
              lastName,
              isVerified: true,
              birthday,
              gender,
              city,
              company: dto.company?.trim() || null,
              jobTitle: dto.jobTitle?.trim() || null,
            },
            update: {
              phone,
              birthday,
              gender,
              city,
              ...(dto.company !== undefined ? { company: dto.company.trim() || null } : {}),
              ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle.trim() || null } : {}),
            },
            select: { id: true },
          })
        : null;

      const unitPrice = event.isFree ? 0 : Number(tier.price);
      const fees = event.isFree ? 0 : Number(event.platformFee ?? 0);
      const registration = await tx.registration.create({
        data: {
          referenceNumber: generateReferenceNumber(),
          userId: user?.id ?? null,
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
              city,
              company: dto.company?.trim() || null,
              jobTitle: dto.jobTitle?.trim() || null,
              subEventId: primarySubEvent?.id ?? null,
              subEventTitle: this.summarizeSubEvents(selectedSubEvents),
              subEventTime: selectedSubEvents.length === 1 ? primarySubEvent?.time ?? null : null,
              selectedSubEvents: selectedSubEvents.length > 0 ? (selectedSubEvents as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
              isLead: true,
            } as any,
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

  async findOnsiteProfileSuggestion(slug: string, dto: OnsiteProfileSuggestionDto) {
    const event = await this.prisma.event.findUnique({
      where: this.eventWhereForQr(slug, dto.eventId),
      select: { id: true, status: true, onsiteRegistrationEnabled: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!event.onsiteRegistrationEnabled) {
      throw new BadRequestException('On-site registration is not enabled for this event.');
    }
    if (event.status !== 'on_sale') {
      throw new BadRequestException(`Registration is not open yet. This event is currently ${this.readableStatus(event.status)}.`);
    }

    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    if (firstName.length < 2 || lastName.length < 2) {
      return { match: null };
    }

    return { match: await this.profileSuggestionForName(firstName, lastName) };
  }

  async generateOnsiteQrPdf(slug: string, eventId?: string) {
    const event = await this.prisma.event.findUnique({
      where: this.eventWhereForQr(slug, eventId),
      select: { id: true, title: true, slug: true, venue: true, startsAt: true, onsiteRegistrationEnabled: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!event.onsiteRegistrationEnabled) {
      throw new BadRequestException('Enable on-site registration before downloading the QR PDF.');
    }

    const scanUrl = this.onsiteUrl(event.slug, event.id);
    const qrPng = await QRCode.toBuffer(scanUrl, { type: 'png', width: 900, margin: 2, errorCorrectionLevel: 'H' });
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const qrImage = await pdf.embedPng(qrPng);
    const { width, height } = page.getSize();
    const orange = rgb(0.92, 0.42, 0);
    const navy = rgb(0.06, 0.1, 0.2);
    const muted = rgb(0.39, 0.45, 0.55);

    page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: orange });
    page.drawText('ON-SITE REGISTRATION', {
      x: 64,
      y: height - 86,
      size: 13,
      font: bold,
      color: orange,
    });

    const titleSize = 28;
    const titleLines = this.wrapPdfText(event.title, bold, titleSize, width - 128);
    const renderedTitleLines = titleLines.slice(0, 3);
    renderedTitleLines.forEach((line, index) => {
      page.drawText(line, {
        x: 64,
        y: height - 128 - index * 34,
        size: titleSize,
        font: bold,
        color: navy,
      });
    });

    const metaText = `${event.startsAt.toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })} - ${event.venue}`;
    const metaY = height - 230 - Math.max(0, renderedTitleLines.length - 1) * 34;
    const metaLines = this.wrapPdfText(metaText, font, 14, width - 128).slice(0, 2);
    metaLines.forEach((line, index) => {
      page.drawText(line, {
        x: 64,
        y: metaY - index * 18,
        size: 14,
        font,
        color: muted,
      });
    });

    const qrSize = 330;
    const qrX = (width - qrSize) / 2;
    const lastMetaLineY = metaY - Math.max(0, metaLines.length - 1) * 18;
    const qrY = Math.max(170, lastMetaLineY - 28 - qrSize - 18);
    page.drawRectangle({
      x: qrX - 18,
      y: qrY - 18,
      width: qrSize + 36,
      height: qrSize + 36,
      borderColor: rgb(0.88, 0.9, 0.94),
      borderWidth: 2,
      color: rgb(1, 1, 1),
    });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    const instruction = 'Scan to register and check in';
    const instructionY = qrY - 48;
    page.drawText(instruction, {
      x: (width - bold.widthOfTextAtSize(instruction, 18)) / 2,
      y: instructionY,
      size: 18,
      font: bold,
      color: navy,
    });

    const buffer = Buffer.from(await pdf.save());
    return {
      buffer,
      filename: `${event.slug}-onsite-registration-qr.pdf`,
    };
  }

  private wrapPdfText(text: string, font: { widthOfTextAtSize(value: string, size: number): number }, size: number, maxWidth: number) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
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
    const existing = await this.findById(id);
    if (dto.status === 'on_sale' && !(dto.imageUrl?.trim() || existing.imageUrl)) {
      throw new BadRequestException('Upload an event cover image before publishing.');
    }
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
        // Turning featuring off must also remove ordering and expiry metadata.
        // Keeping an expired date here would make a later quick re-enable appear
        // successful in admin while remaining absent from the public carousel.
        ...(dto.isFeatured === false && { featuredOrder: null, featuredUntil: null }),
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
