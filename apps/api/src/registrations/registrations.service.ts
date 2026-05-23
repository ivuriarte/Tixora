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
import {
  generateReferenceNumber,
  generateAttendeeQrToken,
} from '@axon-tickets/utils';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
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
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      include: { tiers: { where: { id: dto.tierId } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!event.allowManualPayment) {
      throw new BadRequestException('Manual payment is not enabled for this event');
    }
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

    // Anti-scalper #1: per-account cap across the WHOLE event (not just this
    // registration). Sums attendees from all non-cancelled / non-rejected
    // registrations this user already has for the event.
    const maxPerUser = event.maxPerUser ?? 0;
    if (maxPerUser > 0) {
      const existing = await this.prisma.registration.aggregate({
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

    const unitPrice = Number(tier.price);
    const subtotal = unitPrice * attendeeCount;
    // Per-event service fee. event.platformFee is configured in pesos (e.g. 50);
    // money columns (subtotal/fees/total) are stored in centavos, so convert.
    const fees = Math.round(Number(event.platformFee ?? 50) * 100);
    const total = subtotal + fees;
    const referenceNumber = generateReferenceNumber();

    const registration = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const locked = await tx.$queryRaw<
          Array<{ sold_quantity: number; total_quantity: number }>
        >`
          SELECT sold_quantity, total_quantity
          FROM ticket_tiers
          WHERE id = ${dto.tierId}
          FOR UPDATE
        `;

        if (!locked[0]) throw new NotFoundException('Ticket tier not found');
        const available = locked[0].total_quantity - locked[0].sold_quantity;
        if (available < attendeeCount) {
          throw new BadRequestException(
            `Only ${available} seat(s) available — requested ${attendeeCount}`,
          );
        }

        await tx.ticketTier.update({
          where: { id: dto.tierId },
          data: { soldQuantity: { increment: attendeeCount } },
        });

        return tx.registration.create({
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
            total,
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
                isLead: i === 0,
              })),
            },
          },
          include: { attendees: true, event: true },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

    const lead = registration.attendees.find((a) => a.isLead) ?? registration.attendees[0];
    if (lead && event.bankName && event.bankAccountNumber && event.bankAccountName) {
      const webBase = this.config.get<string>('webUrl') ?? 'https://axon-tickets-app.vercel.app';
      try {
        await this.emailService.sendRegistrationConfirmation(
          lead.email,
          lead.firstName,
          referenceNumber,
          event.title,
          event.bankName,
          event.bankAccountNumber,
          event.bankAccountName,
          `${webBase}/registrations/${registration.id}`,
        );
      } catch (e: unknown) {
        // Log but do not fail the registration creation - user can re-fetch bank details from the page
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
      total: Number(registration.total),
      currency: registration.currency,
      status: registration.status,
      createdAt: registration.createdAt.toISOString(),
    };
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
      referenceNumber: reg.referenceNumber,
      status: reg.status,
      tierName: reg.tierName,
      unitPrice: reg.unitPrice ? Number(reg.unitPrice) : null,
      attendeeCount: reg.attendeeCount,
      subtotal: Number(reg.subtotal),
      fees: Number(reg.fees),
      total: Number(reg.total),
      currency: reg.currency,
      notes: reg.notes,
      rejectionReason: reg.rejectionReason,
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
      },
      attendees: reg.attendees.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone,
        company: a.company,
        jobTitle: a.jobTitle,
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

  async cancel(id: string, userId: string) {
    const reg = await this.prisma.registration.findFirst({
      where: { id, userId },
      include: {
        attendees: { where: { isLead: true }, take: 1 },
        event: { select: { title: true, slug: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (!['pending_payment', 'proof_submitted'].includes(reg.status)) {
      throw new BadRequestException(
        'Only pending or proof-submitted registrations can be cancelled',
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
        this.config.get<string>('webUrl') ?? 'https://axon-tickets-app.vercel.app';
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
        event: { select: { title: true, slug: true, startsAt: true, venue: true } },
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
    if (reg.status !== 'proof_submitted') {
      throw new BadRequestException(
        `Only proof_submitted registrations can be approved (current: ${reg.status})`,
      );
    }
    const latestProof = reg.proofs[0];
    if (!latestProof) {
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
      this.prisma.paymentProof.update({
        where: { id: latestProof.id },
        data: {
          status: 'approved',
          reviewedById: adminUserId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      }),
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
      metadata: { proofId: latestProof.id, attendeeCount: reg.attendees.length },
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
    if (reg.status !== 'proof_submitted') {
      throw new BadRequestException(
        `Only proof_submitted registrations can be rejected (current: ${reg.status})`,
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
        process.env.WEB_BASE_URL ??
        'https://axon-tickets-app.vercel.app';
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
    status: string = 'proof_submitted',
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
    // dateFrom -> start of day UTC; dateTo -> end of day UTC.
    const created: Prisma.DateTimeFilter = {};
    const parseFrom = (s?: string): Date | undefined => {
      if (!s) return undefined;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    };
    const parseTo = (s?: string): Date | undefined => {
      if (!s) return undefined;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59.999Z`) : new Date(s);
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

  async pendingCount() {
    const count = await this.prisma.registration.count({
      where: { status: 'proof_submitted' },
    });
    return { count };
  }

  private async sendQrEmail(registrationId: string): Promise<void> {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        attendees: { orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] },
        event: { select: { title: true, startsAt: true, venue: true } },
      },
    });
    if (!reg) return;
    const lead = reg.attendees.find((a) => a.isLead) ?? reg.attendees[0];
    if (!lead) return;

    const eventDate = reg.event.startsAt.toISOString().slice(0, 10);
    await this.emailService.sendQrCodeEmail(
      lead.email,
      lead.firstName,
      reg.event.title,
      eventDate,
      reg.event.venue,
      reg.attendees.map((a) => ({
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        qrToken: a.qrToken,
      })),
    );
  }
}

