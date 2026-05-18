import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { generateReferenceNumber, calculateFee } from '@axon-tickets/utils';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateRegistrationDto, userId: string, ip?: string) {
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

    const unitPrice = Number(tier.price);
    const subtotal = unitPrice * attendeeCount;
    const fees = calculateFee(subtotal);
    const total = subtotal + fees;
    const referenceNumber = generateReferenceNumber();

    const registration = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const locked = await tx.$queryRaw<
          Array<{ sold_quantity: number; total_quantity: number }>
        >`
          SELECT sold_quantity, total_quantity
          FROM ticket_tiers
          WHERE id = ${dto.tierId}::uuid
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
      await this.emailService.sendRegistrationConfirmation(
        lead.email,
        lead.firstName,
        referenceNumber,
        event.title,
        event.bankName,
        event.bankAccountNumber,
        event.bankAccountName,
      );
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
          },
        },
        attendees: { orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] },
        proofs: { select: { id: true, status: true, createdAt: true } },
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
      })),
    };
  }

  async cancel(id: string, userId: string) {
    const reg = await this.prisma.registration.findFirst({ where: { id, userId } });
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
        proofs: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        verifiedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    return reg;
  }
}

