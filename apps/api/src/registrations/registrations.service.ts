import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { FunnelService } from '../funnel/funnel.service';
import {
  generateReferenceNumber,
  generateAttendeeQrToken,
} from '@axon-tickets/utils';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationAttendeesDto } from './dto/update-registration-attendees.dto';
import { ValidateReferralCodeDto } from '../admin/dto/referral-code.dto';

const ACTIVE_REGISTRATION_STATUSES = ['pending_payment', 'proof_submitted', 'pending_approval', 'verified'] as const;
const VALID_TICKET_STATUSES = ['valid', 'used'] as const;

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly funnel: FunnelService,
  ) {}

  async create(dto: CreateRegistrationDto, userId: string, ip?: string) {
    try {
      return await this.createImpl(dto, userId, ip);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Registration create failed user=${userId} event=${dto.eventId} tier=${dto.tierId}: ${msg}`,
        stack,
      );
      throw err;
    }
  }

  private async createImpl(dto: CreateRegistrationDto, userId: string, ip?: string) {
    this.validateAttendeeDemographics(dto.attendees);
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      include: { tiers: { where: { id: dto.tierId } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!['published', 'on_sale'].includes(event.status)) {
      throw new BadRequestException('Event is not open for registration');
    }

    const tier = event.tiers[0];
    if (!tier) throw new NotFoundException('Ticket tier not found');

    const attendeeCount = dto.attendees.length;
    if (attendeeCount > tier.maxPerOrder) {
      throw new BadRequestException(
        `Maximum ${tier.maxPerOrder} attendees per registration for this tier`,
      );
    }

    const unitPrice = Number(tier.price);
    const subtotal = unitPrice * attendeeCount;
    const isFreeEvent = unitPrice === 0 && Number(event.platformFee ?? 50) === 0;
    const fees = isFreeEvent ? 0 : Number(event.platformFee ?? 50);

    if (!isFreeEvent && !event.allowManualPayment) {
      throw new BadRequestException('Manual payment is not enabled for this event');
    }
    const referenceNumber = generateReferenceNumber();
    const maxPerUser = event.maxPerUser ?? 0;

    const registration = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Serialize all registration attempts for this (user, event) pair —
        // closes the race window where two near-simultaneous requests (double
        // click, auto-submit firing twice, network retry) could both pass the
        // duplicate-registration check below before either one commits.
        // pg_advisory_xact_lock auto-releases when this transaction ends.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${dto.eventId}))`;

        // Duplicate registration guard: block if user already has an active
        // registration for this event.
        // Now inside the lock above, so a concurrent request can't slip
        // through before this one commits.
        const activeRegistration = await tx.registration.findFirst({
          where: {
            userId,
            eventId: dto.eventId,
            status: { in: ['pending_payment', 'proof_submitted', 'pending_approval'] },
          },
          select: { id: true, status: true },
        });
        if (activeRegistration) {
          throw new BadRequestException(
            activeRegistration.status === 'pending_approval'
              ? 'You already have a registration awaiting review for this event.'
              : activeRegistration.status === 'proof_submitted'
              ? 'You already have a registration awaiting review for this event.'
              : 'You already have an incomplete registration for this event. Please complete your existing registration or wait for it to expire.',
          );
        }

        // Anti-scalper #1: per-account cap across the WHOLE event (not just
        // this registration). Sums attendees from all non-cancelled /
        // non-rejected registrations this user already has for the event.
        if (maxPerUser > 0) {
          const existing = await tx.registration.aggregate({
            where: {
              userId,
              eventId: dto.eventId,
              status: { notIn: ['cancelled', 'rejected'] },
            },
            _sum: { attendeeCount: true },
          });
          const alreadyBooked = existing._sum.attendeeCount ?? 0;
          if (alreadyBooked + attendeeCount > maxPerUser) {
            const remaining = Math.max(maxPerUser - alreadyBooked, 0);
            throw new BadRequestException(
              remaining === 0
                ? `You have already reached the limit of ${maxPerUser} ticket(s) for this event.`
                : `You can only register ${remaining} more ticket(s) for this event (limit ${maxPerUser} per attendee, you already have ${alreadyBooked}).`,
            );
          }
        }

        const locked = await tx.$queryRaw<
          Array<{ sold_quantity: number; total_quantity: number }>
        >`
          SELECT sold_quantity, total_quantity
          FROM ticket_tiers
          WHERE id = ${dto.tierId}
          FOR UPDATE
        `;

        if (!locked[0]) throw new NotFoundException('Ticket tier not found');
        const registrationUsage = await tx.registration.aggregate({
          where: {
            tierId: dto.tierId,
            status: { in: [...ACTIVE_REGISTRATION_STATUSES] as any[] },
          },
          _sum: { attendeeCount: true },
        });
        const ticketUsage = await tx.ticket.count({
          where: {
            ticketTierId: dto.tierId,
            status: { in: [...VALID_TICKET_STATUSES] as any[] },
          },
        });
        const occupied = Number(registrationUsage._sum.attendeeCount ?? 0) + ticketUsage;
        const available = locked[0].total_quantity - occupied;
        if (available < attendeeCount) {
          throw new BadRequestException(
            `Only ${available} seat(s) available — requested ${attendeeCount}`,
          );
        }

        await tx.ticketTier.update({
          where: { id: dto.tierId },
          data: { soldQuantity: occupied + attendeeCount },
        });

        let discount = 0;
        let referral: Awaited<ReturnType<typeof tx.referralCode.findFirst>> = null;
        if (dto.referralCode?.trim()) {
          const normalizedCode = dto.referralCode.trim().toUpperCase();
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.eventId}), hashtext(${normalizedCode}))`;
          referral = await tx.referralCode.findFirst({
            where: { eventId: dto.eventId, code: normalizedCode },
          });
          const validation = await this.evaluateReferral(tx, referral, dto.tierId, subtotal);
          discount = validation.discount;
        }
        const total = Math.max(0, subtotal - discount) + fees;

        const created = await tx.registration.create({
          data: {
            referenceNumber,
            userId,
            eventId: dto.eventId,
            tierId: dto.tierId,
            tierName: tier.name,
            unitPrice,
            attendeeCount,
            subtotal,
            fees,
            discount,
            total,
            status: isFreeEvent ? 'pending_approval' : 'pending_payment',
            ...(referral && {
              referralCodeId: referral.id,
              referralCodeSnapshot: {
                code: referral.code,
                name: referral.name,
                discountType: referral.discountType,
                discountValue: Number(referral.discountValue),
                discountAmount: discount,
              },
            }),
            currency: tier.currency,
            notes: dto.notes,
            attendees: {
              create: dto.attendees.map((a, i) => ({
                firstName: a.firstName,
                lastName: a.lastName,
                email: a.email,
                phone: a.phone,
                company: a.company,
                jobTitle: a.jobTitle,
                birthday: new Date(`${a.birthday}T00:00:00.000Z`),
                gender: a.gender,
                city: a.city.trim(),
                isLead: i === 0,
              })),
            },
          },
          include: { attendees: true, event: true },
        });
        if (referral) {
          await tx.referralCodeUsage.create({
            data: {
              referralCodeId: referral.id,
              registrationId: created.id,
              discountAmount: discount,
              attendeeCount,
            },
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: {
            birthday: new Date(`${dto.attendees[0].birthday}T00:00:00.000Z`),
            gender: dto.attendees[0].gender,
            city: dto.attendees[0].city.trim(),
          },
        });
        return created;
      },
      { isolationLevel: 'ReadCommitted' },
    );

    const lead = registration.attendees.find((a) => a.isLead) ?? registration.attendees[0];
    if (lead) {
      const webBase = this.config.get<string>('webUrl') ?? 'https://axontickets.online';
      const registrationUrl = `${webBase}/registrations/${registration.id}`;
      try {
        if (isFreeEvent) {
          await this.emailService.sendFreeRegistrationConfirmation(
            lead.email,
            lead.firstName,
            referenceNumber,
            event.title,
            registrationUrl,
          );
        } else if (event.bankName && event.bankAccountNumber && event.bankAccountName) {
          await this.emailService.sendRegistrationConfirmation(
            lead.email,
            lead.firstName,
            referenceNumber,
            event.title,
            event.bankName,
            event.bankAccountNumber,
            event.bankAccountName,
            registrationUrl,
          );
        }
      } catch (e: unknown) {
        const err = e as Error;
        this.logger.warn({
          msg: 'Registration confirmation email failed',
          regId: registration.id,
          err: err.message,
        });
      }
    }

    await this.audit.log({
      action: 'REGISTRATION_CREATED',
      entityType: 'Registration',
      entityId: registration.id,
      registrationId: registration.id,
      performedById: userId,
      ipAddress: ip,
      metadata: {
        referralCode: (registration.referralCodeSnapshot as any)?.code ?? null,
        discount: Number(registration.discount),
        attendeeCount: registration.attendeeCount,
      },
    });

    this.logger.log({
      msg: 'Registration created',
      registrationId: registration.id,
      eventId: registration.eventId,
      userId,
    });

    return {
      id: registration.id,
      referenceNumber: registration.referenceNumber,
      eventId: registration.eventId,
      eventTitle: (registration.event as { title: string }).title,
      tierId: registration.tierId,
      tierName: registration.tierName,
      unitPrice: registration.unitPrice ? Number(registration.unitPrice) : null,
      attendeeCount: registration.attendeeCount,
      subtotal: Number(registration.subtotal),
      fees: Number(registration.fees),
      discount: Number(registration.discount),
      total: Number(registration.total),
      isFree: Number(registration.total) === 0,
      currency: registration.currency,
      status: registration.status,
      createdAt: registration.createdAt.toISOString(),
    };
  }

  async validateReferralCode(dto: ValidateReferralCodeDto) {
    const tier = await this.prisma.ticketTier.findFirst({
      where: { id: dto.tierId, eventId: dto.eventId },
      select: { price: true },
    });
    if (!tier) throw new NotFoundException('Ticket tier not found');
    const referral = await this.prisma.referralCode.findFirst({
      where: { eventId: dto.eventId, code: dto.code.trim().toUpperCase() },
    });
    const subtotal = Number(tier.price) * dto.attendeeCount;
    const result = await this.evaluateReferral(this.prisma, referral, dto.tierId, subtotal);
    return {
      valid: true,
      code: referral!.code,
      name: referral!.name,
      discount: result.discount,
      subtotal,
      discountedSubtotal: Math.max(0, subtotal - result.discount),
    };
  }

  private async evaluateReferral(
    db: Pick<Prisma.TransactionClient, 'referralCodeUsage'>,
    referral: { id: string; code: string; isActive: boolean; validFrom: Date | null; validUntil: Date | null; maxUses: number | null; applicableTierIds: Prisma.JsonValue; discountType: string; discountValue: Prisma.Decimal } | null,
    tierId: string,
    subtotal: number,
  ) {
    if (!referral || !referral.isActive) throw new BadRequestException('Referral code is invalid or inactive.');
    const now = new Date();
    if (referral.validFrom && referral.validFrom > now) throw new BadRequestException('Referral code is not active yet.');
    if (referral.validUntil && referral.validUntil < now) throw new BadRequestException('Referral code has expired.');
    const tierIds = Array.isArray(referral.applicableTierIds) ? referral.applicableTierIds.filter((v): v is string => typeof v === 'string') : [];
    if (tierIds.length > 0 && !tierIds.includes(tierId)) throw new BadRequestException('Referral code does not apply to this ticket tier.');
    if (referral.maxUses) {
      const used = await db.referralCodeUsage.count({ where: { referralCodeId: referral.id } });
      if (used >= referral.maxUses) throw new BadRequestException('Referral code usage limit has been reached.');
    }
    const value = Number(referral.discountValue);
    const raw = referral.discountType === 'percentage' ? subtotal * (value / 100) : value;
    return { discount: Math.max(0, Math.min(subtotal, Math.round(raw * 100) / 100)) };
  }

  private validateAttendeeDemographics(attendees: Array<{ birthday: string; city: string }>) {
    const today = new Date();
    const earliest = new Date(Date.UTC(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate()));
    for (const attendee of attendees) {
      const birthday = new Date(`${attendee.birthday}T00:00:00.000Z`);
      if (!Number.isFinite(birthday.getTime()) || birthday > today || birthday < earliest) {
        throw new BadRequestException('Birthday must be a valid past date within the last 120 years.');
      }
      if (!attendee.city.trim()) throw new BadRequestException('City is required for every attendee.');
    }
  }

  async findMine(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(limit, 50);
    const skip = (safePage - 1) * safeLimit;

    const [total, items] = await Promise.all([
      this.prisma.registration.count({ where: { userId } }),
      this.prisma.registration.findMany({
        where: { userId },
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: {
              title: true,
              slug: true,
              startsAt: true,
              venue: true,
              imageUrl: true,
            },
          },
        },
      }),
    ]);

    return {
      data: items.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        eventTitle: r.event.title,
        eventSlug: r.event.slug,
        eventStartsAt: r.event.startsAt.toISOString(),
        eventVenue: r.event.venue,
        eventImageUrl: r.event.imageUrl,
        tierName: r.tierName,
        attendeeCount: r.attendeeCount,
        total: Number(r.total),
        isFree: Number(r.total) === 0,
        currency: r.currency,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  /**
   * Check whether the current user already has an active (non-cancelled / non-rejected)
   * registration for a given event. Used to prevent duplicate registrations.
   */
  async checkForEvent(userId: string, eventId: string) {
    const reg = await this.prisma.registration.findFirst({
      where: {
        userId,
        eventId,
        status: { notIn: ['cancelled', 'rejected'] },
      },
      select: {
        id: true,
        referenceNumber: true,
        status: true,
        tierName: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasRegistration: !!reg,
      registration: reg
        ? {
            id: reg.id,
            referenceNumber: reg.referenceNumber,
            status: reg.status,
            tierName: reg.tierName,
          }
        : null,
    };
  }

  async findById(id: string, userId: string) {
    const reg = await this.prisma.registration.findFirst({
      where: { id, userId },
      include: {
        event: {
          select: {
            title: true,
            slug: true,
            startsAt: true,
            endsAt: true,
            venue: true,
            address: true,
            imageUrl: true,
            bankName: true,
            bankAccountNumber: true,
            bankAccountName: true,
            gcashNumber: true,
            paymentMethods: true,
            landmark: true,
          },
        },
        attendees: { orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] },
        proofs: {
          select: {
            id: true,
            status: true,
            imageUrl: true,
            rejectionReason: true,
            reviewedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    return {
      id: reg.id,
      eventId: reg.eventId,
      referenceNumber: reg.referenceNumber,
      status: reg.status,
      tierName: reg.tierName,
      unitPrice: reg.unitPrice ? Number(reg.unitPrice) : null,
      attendeeCount: reg.attendeeCount,
      subtotal: Number(reg.subtotal),
      fees: Number(reg.fees),
      total: Number(reg.total),
      discount: Number(reg.discount),
      referralCode: (reg.referralCodeSnapshot as any)?.code ?? null,
      currency: reg.currency,
      notes: reg.notes,
      rejectionReason: reg.rejectionReason,
      isFree: Number(reg.total) === 0,
      createdAt: reg.createdAt.toISOString(),
      updatedAt: reg.updatedAt.toISOString(),
      event: {
        title: reg.event.title,
        slug: reg.event.slug,
        startsAt: reg.event.startsAt.toISOString(),
        endsAt: reg.event.endsAt?.toISOString() ?? null,
        venue: reg.event.venue,
        address: reg.event.address,
        imageUrl: reg.event.imageUrl,
        bankName: reg.event.bankName,
        bankAccountNumber: reg.event.bankAccountNumber,
        bankAccountName: reg.event.bankAccountName,
        gcashNumber: reg.event.gcashNumber,
        paymentMethods: reg.event.paymentMethods ?? null,
        landmark: reg.event.landmark,
      },
      attendees: reg.attendees.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone,
        company: a.company,
        jobTitle: a.jobTitle,
        birthday: a.birthday?.toISOString().slice(0, 10) ?? null,
        gender: a.gender,
        city: a.city,
        isLead: a.isLead,
        hasQr: !!a.qrToken,
        checkedInAt: a.checkedInAt?.toISOString() ?? null,
      })),
      proofs: reg.proofs.map((p) => ({
        id: p.id,
        status: p.status,
        uploadedAt: p.createdAt.toISOString(),
        imageUrl: p.imageUrl,
        rejectionReason: p.rejectionReason,
        reviewedAt: p.reviewedAt?.toISOString() ?? null,
      })),
    };
  }

  async updateAttendees(id: string, userId: string, dto: UpdateRegistrationAttendeesDto) {
    this.validateAttendeeDemographics(dto.attendees);
    const reg = await this.prisma.registration.findFirst({
      where: { id, userId },
      include: { attendees: { orderBy: { isLead: 'desc' } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'pending_payment') {
      throw new BadRequestException(
        'Attendee details can only be updated before payment is submitted',
      );
    }
    if (dto.attendees.length !== reg.attendees.length) {
      throw new BadRequestException(
        `Expected ${reg.attendees.length} attendee(s) — cannot change quantity`,
      );
    }

    await this.prisma.$transaction([
      ...reg.attendees.map((a, i) =>
        this.prisma.attendee.update({
          where: { id: a.id },
          data: {
            firstName: dto.attendees[i].firstName,
            lastName: dto.attendees[i].lastName,
            email: dto.attendees[i].email,
            phone: dto.attendees[i].phone ?? null,
            company: dto.attendees[i].company ?? null,
            jobTitle: dto.attendees[i].jobTitle ?? null,
            birthday: new Date(`${dto.attendees[i].birthday}T00:00:00.000Z`),
            gender: dto.attendees[i].gender,
            city: dto.attendees[i].city.trim(),
          },
        }),
      ),
      ...(dto.notes !== undefined
        ? [this.prisma.registration.update({ where: { id }, data: { notes: dto.notes } })]
        : []),
    ]);

    return { message: 'Attendees updated' };
  }

  async cancel(id: string, userId: string) {
    const reg = await this.prisma.registration.findFirst({
      where: { id, userId },
      include: {
        attendees: { where: { isLead: true }, take: 1 },
        event: { select: { title: true, slug: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (!['pending_payment', 'proof_submitted', 'pending_approval'].includes(reg.status)) {
      throw new BadRequestException(
        'Only pending or awaiting-approval registrations can be cancelled',
      );
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.registration.update({
        where: { id },
        data: { status: 'cancelled' },
      }),
    ];
    if (reg.tierId) {
      ops.unshift(
        this.prisma.ticketTier.update({
          where: { id: reg.tierId },
          data: { soldQuantity: { decrement: reg.attendeeCount } },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    await this.audit.log({
      action: 'REGISTRATION_CANCELLED',
      entityType: 'Registration',
      entityId: id,
      registrationId: id,
      performedById: userId,
    });

    const lead = reg.attendees[0];
    if (lead) {
      const webBase =
        this.config.get<string>('webUrl') ?? 'https://axontickets.online';
      try {
        await this.emailService.sendCancellationEmail(
          lead.email,
          lead.firstName,
          reg.referenceNumber,
          reg.event.title,
          'You cancelled your registration.',
          `${webBase}/events/${reg.event.slug}`,
        );
      } catch (e: unknown) {
        this.logger.warn({ msg: 'Cancellation email failed', regId: id, err: (e as Error).message });
      }
    }

    return { message: 'Registration cancelled' };
  }

  async findByEvent(eventId: string, status?: string, page = 1, limit = 50) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(limit, 100);
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.RegistrationWhereInput = { eventId };
    if (status) {
      where.status = status as Prisma.EnumRegistrationStatusFilter;
    }

    const [total, items] = await Promise.all([
      this.prisma.registration.count({ where }),
      this.prisma.registration.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          attendees: { where: { isLead: true }, take: 1 },
          proofs: { select: { id: true, status: true } },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      data: items.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        status: r.status,
        tierName: r.tierName,
        attendeeCount: r.attendeeCount,
        total: Number(r.total),
        currency: r.currency,
        leadName: r.attendees[0]
          ? `${r.attendees[0].firstName} ${r.attendees[0].lastName}`
          : `${r.user.firstName} ${r.user.lastName}`,
        leadEmail: r.attendees[0]?.email ?? r.user.email,
        hasProof: r.proofs.length > 0,
        proofStatus: r.proofs[0]?.status ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async findByIdAdmin(id: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        event: { select: { title: true, slug: true, startsAt: true, venue: true, address: true, landmark: true } },
        attendees: { orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] },
        proofs: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        verifiedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    return reg;
  }

  async approve(id: string, adminUserId: string, ip?: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        proofs: { orderBy: { createdAt: 'desc' }, take: 1 },
        attendees: { orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] },
        event: {
          select: { id: true, title: true, startsAt: true, venue: true, maxCapacity: true },
        },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'proof_submitted' && reg.status !== 'pending_approval') {
      throw new BadRequestException(
        `Only pending_approval or proof_submitted registrations can be approved (current: ${reg.status})`,
      );
    }
    const isFreeRegistration = Number(reg.total) === 0;
    const latestProof = reg.proofs[0];
    if (!isFreeRegistration && !latestProof) {
      throw new BadRequestException('No payment proof found on this registration');
    }

    const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';

    // Generate QR tokens for any attendees missing one
    const attendeeUpdates = reg.attendees.map((a) => {
      const qrToken =
        a.qrToken ??
        generateAttendeeQrToken(
          { attendeeId: a.id, registrationId: reg.id, eventId: reg.event.id },
          qrSecret,
        );
      return { id: a.id, qrToken };
    });

    await this.prisma.$transaction([
      this.prisma.registration.update({
        where: { id },
        data: {
          status: 'verified',
          verifiedById: adminUserId,
          verifiedAt: new Date(),
          rejectionReason: null,
        },
      }),
      ...(latestProof
        ? [
            this.prisma.paymentProof.update({
              where: { id: latestProof.id },
              data: {
                status: 'approved',
                reviewedById: adminUserId,
                reviewedAt: new Date(),
                rejectionReason: null,
              },
            }),
          ]
        : []),
      ...attendeeUpdates.map((u) =>
        this.prisma.attendee.update({
          where: { id: u.id },
          data: { qrToken: u.qrToken },
        }),
      ),
    ]);

    await this.audit.log({
      action: 'REGISTRATION_APPROVED',
      entityType: 'Registration',
      entityId: id,
      registrationId: id,
      performedById: adminUserId,
      ipAddress: ip,
      metadata: { proofId: latestProof?.id ?? null, attendeeCount: reg.attendees.length, isFree: isFreeRegistration },
    });

    await this.funnel.track({
      eventId: reg.event.id,
      userId: reg.userId,
      step: 'ticket_issued',
      status: 'success',
      metadata: {
        registrationId: reg.id,
        attendeeCount: reg.attendees.length,
      },
    });

    // Send QR delivery email to lead attendee.
    // Awaited (not fire-and-forget) so Vercel Lambda does not terminate before flush.
    try {
      await this.sendQrEmail(reg.id);
    } catch (e: unknown) {
      const err = e as Error;
      this.logger.warn({ msg: 'QR email failed', regId: reg.id, err: err.message });
    }

    this.logger.log({ msg: 'Registration approved', id, adminUserId });

    // Auto sold-out: if the event has a capacity limit, check if we've now reached it
    if (reg.event.maxCapacity) {
      const verifiedAttendees = await this.prisma.attendee.count({
        where: { registration: { eventId: reg.event.id, status: 'verified' } },
      });
      if (verifiedAttendees >= reg.event.maxCapacity) {
        await this.prisma.event.updateMany({
          where: { id: reg.event.id, status: 'on_sale' as any },
          data: { status: 'sold_out' as any },
        });
      }
    }

    return { message: 'Registration approved', id, status: 'verified' };
  }

  async reject(id: string, adminUserId: string, reason: string, ip?: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        proofs: { orderBy: { createdAt: 'desc' }, take: 1 },
        attendees: { where: { isLead: true }, take: 1 },
        event: { select: { title: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'proof_submitted' && reg.status !== 'pending_approval') {
      throw new BadRequestException(
        `Only pending_approval or proof_submitted registrations can be rejected (current: ${reg.status})`,
      );
    }
    const latestProof = reg.proofs[0];

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.registration.update({
        where: { id },
        data: { status: 'rejected', rejectionReason: reason },
      }),
    ];
    if (latestProof) {
      ops.push(
        this.prisma.paymentProof.update({
          where: { id: latestProof.id },
          data: {
            status: 'rejected',
            reviewedById: adminUserId,
            reviewedAt: new Date(),
            rejectionReason: reason,
          },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    await this.audit.log({
      action: 'REGISTRATION_REJECTED',
      entityType: 'Registration',
      entityId: id,
      registrationId: id,
      performedById: adminUserId,
      ipAddress: ip,
      metadata: { reason, proofId: latestProof?.id ?? null },
    });

    // Send rejection email (await for Lambda reliability)
    const lead = reg.attendees[0];
    if (lead) {
      const webBase =
        this.config.get<string>('web.baseUrl') ??
        'https://axontickets.online';
      try {
        await this.emailService.sendRejectionEmail(
          lead.email,
          lead.firstName,
          reg.referenceNumber,
          reg.event.title,
          reason,
          `${webBase}/registrations/${reg.id}`,
        );
      } catch (e: unknown) {
        const err = e as Error;
        this.logger.warn({ msg: 'Rejection email failed', regId: reg.id, err: err.message });
      }
    }

    this.logger.log({ msg: 'Registration rejected', id, adminUserId });
    return { message: 'Registration rejected', id, status: 'rejected' };
  }

  async bulkApprove(ids: string[], adminUserId: string, ip?: string) {
    if (!ids.length) {
      throw new BadRequestException('No registration ids provided');
    }
    if (ids.length > 20) {
      throw new BadRequestException('Maximum 20 registrations per bulk action');
    }
    // Parallel with allSettled to avoid 30s Vercel timeout when serial-awaiting emails.
    const settled = await Promise.allSettled(
      ids.map((id) => this.approve(id, adminUserId, ip)),
    );
    const results = settled.map((s, i) => {
      if (s.status === 'fulfilled') {
        return { id: ids[i], ok: true };
      }
      const err = s.reason as Error;
      return { id: ids[i], ok: false, error: err.message };
    });
    const successCount = results.filter((r) => r.ok).length;
    return {
      message: `Bulk approve completed: ${successCount}/${ids.length} succeeded`,
      results,
    };
  }

  async bulkReject(
    ids: string[],
    adminUserId: string,
    reason: string,
    ip?: string,
  ) {
    if (!ids.length) {
      throw new BadRequestException('No registration ids provided');
    }
    if (ids.length > 20) {
      throw new BadRequestException('Maximum 20 registrations per bulk action');
    }
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Rejection reason must be at least 5 characters');
    }
    const settled = await Promise.allSettled(
      ids.map((id) => this.reject(id, adminUserId, reason, ip)),
    );
    const results = settled.map((s, i) => {
      if (s.status === 'fulfilled') {
        return { id: ids[i], ok: true };
      }
      const err = s.reason as Error;
      return { id: ids[i], ok: false, error: err.message };
    });
    const successCount = results.filter((r) => r.ok).length;
    return {
      message: `Bulk reject completed: ${successCount}/${ids.length} succeeded`,
      results,
    };
  }

  async resend(id: string, adminUserId: string, ip?: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'verified') {
      throw new BadRequestException(
        'Only verified registrations support resend',
      );
    }

    await this.sendQrEmail(id);

    await this.audit.log({
      action: 'RESEND_QR',
      entityType: 'Registration',
      entityId: id,
      registrationId: id,
      performedById: adminUserId,
      ipAddress: ip,
    });

    return { message: 'QR email resent' };
  }

  async listPendingVerifications(
    eventId?: string,
    status: string = 'pending_approval',
    page = 1,
    limit = 50,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(limit, 100);
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.RegistrationWhereInput = {};
    if (eventId) where.eventId = eventId;
    if (status) where.status = status as Prisma.RegistrationWhereInput['status'];

    // Inclusive date range on createdAt. Accepts YYYY-MM-DD or ISO timestamps.
    // dateFrom -> start of day Manila (UTC+8); dateTo -> end of day Manila (UTC+8).
    const created: Prisma.DateTimeFilter = {};
    const parseFrom = (s?: string): Date | undefined => {
      if (!s) return undefined;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+08:00`) : new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    };
    const parseTo = (s?: string): Date | undefined => {
      if (!s) return undefined;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59.999+08:00`) : new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    };
    const gte = parseFrom(dateFrom);
    const lte = parseTo(dateTo);
    if (gte) created.gte = gte;
    if (lte) created.lte = lte;
    if (gte || lte) where.createdAt = created;

    const [total, items] = await Promise.all([
      this.prisma.registration.count({ where }),
      this.prisma.registration.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { title: true, slug: true } },
          attendees: { where: { isLead: true }, take: 1 },
          proofs: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      data: items.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        status: r.status,
        tierName: r.tierName,
        attendeeCount: r.attendeeCount,
        total: Number(r.total),
        currency: r.currency,
        eventTitle: r.event.title,
        eventSlug: r.event.slug,
        leadName: r.attendees[0]
          ? `${r.attendees[0].firstName} ${r.attendees[0].lastName}`
          : `${r.user.firstName} ${r.user.lastName}`,
        leadEmail: r.attendees[0]?.email ?? r.user.email,
        hasProof: r.proofs.length > 0,
        proofStatus: r.proofs[0]?.status ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async pendingCount(organizerUserId?: string) {
    const where: Prisma.RegistrationWhereInput = {
      status: { in: ['pending_approval', 'proof_submitted'] },
    };
    if (organizerUserId) {
      where.event = {
        organization: {
          approvalStatus: 'approved',
          members: { some: { userId: organizerUserId } },
        },
      };
    }
    const count = await this.prisma.registration.count({ where });
    return { count };
  }

  private async sendQrEmail(registrationId: string): Promise<void> {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        attendees: { orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] },
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            venue: true,
            city: true,
            organization: { select: { name: true } },
          },
        },
      },
    });
    if (!reg) return;
    if (reg.attendees.length === 0) return;

    const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';
    const eventDate = reg.event.startsAt.toISOString().slice(0, 10);

    const isFreeRegistration = Number(reg.total) === 0;
    const receipt = {
      referenceNumber: reg.referenceNumber,
      transactionDate: reg.createdAt.toISOString().slice(0, 10),
      paymentMethod: reg.paymentMethod ?? undefined,
      tierName: reg.tierName ?? undefined,
      quantity: reg.attendeeCount,
      unitPrice: reg.unitPrice ? Number(reg.unitPrice) : undefined,
      subtotal: Number(reg.subtotal),
      fees: Number(reg.fees),
      discount: Number(reg.discount),
      referralCode: (reg.referralCodeSnapshot as any)?.code,
      total: Number(reg.total),
      organizerName: reg.event.organization?.name ?? undefined,
      eventCity: reg.event.city,
      isFree: isFreeRegistration,
    };

    // Send an individual QR email to every attendee at their own email address.
    // If qrToken is unexpectedly null after approval (e.g. replica lag), regenerate on the fly.
    // Using allSettled so a single bad address does not block the rest of the group.
    const results = await Promise.allSettled(
      reg.attendees.map((a) => {
        let qrToken = a.qrToken;
        if (!qrToken) {
          qrToken = generateAttendeeQrToken(
            { attendeeId: a.id, registrationId: reg.id, eventId: reg.event.id },
            qrSecret,
          );
          this.logger.warn({
            msg: 'QR token was null at email send time — regenerated on the fly',
            regId: registrationId,
            attendeeId: a.id,
          });
          // Persist the recovered token (fire-and-forget — do not block the email)
          this.prisma.attendee.update({ where: { id: a.id }, data: { qrToken } }).catch(() => void 0);
        }
        this.logger.log({
          msg: 'Sending QR email to attendee',
          regId: registrationId,
          attendeeId: a.id,
          hasQrToken: !!qrToken,
        });
        return this.emailService.sendQrCodeEmail(
          a.email,
          a.firstName,
          reg.event.title,
          eventDate,
          reg.event.venue,
          [{ firstName: a.firstName, lastName: a.lastName, email: a.email, qrToken }],
          receipt,
        );
      }),
    );

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const a = reg.attendees[i];
        this.logger.warn({
          msg: 'QR email failed for attendee',
          regId: registrationId,
          attendeeId: a.id,
          err: (r.reason as Error)?.message,
        });
      }
    });
  }
}
