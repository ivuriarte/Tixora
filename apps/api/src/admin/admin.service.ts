import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { TicketTiersService } from '../ticket-tiers/ticket-tiers.service';
import { OrdersService } from '../orders/orders.service';
import { CreateEventDto, UpdateEventDto } from '../events/dto/event.dto';
import { CreateTierDto, UpdateTierDto } from '../ticket-tiers/dto/tier.dto';
import { verifyQrToken, verifyAttendeeQrToken } from '@axon-tickets/utils';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { Resend } from 'resend';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly tiersService: TicketTiersService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.resend = new Resend(this.config.get<string>('resend.apiKey'));
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

  async createEvent(dto: CreateEventDto, adminId: string) {
    return this.eventsService.create(dto, adminId);
  }

  async getEvent(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        tiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async updateEvent(id: string, dto: UpdateEventDto, adminId: string) {
    const updated = await this.eventsService.update(id, dto);
    await this.audit.log({
      action: 'EVENT_UPDATED',
      entityType: 'Event',
      entityId: id,
      performedById: adminId,
      metadata: Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>,
    });
    return updated;
  }

  async deleteEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id }, select: { id: true } });
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

  async listEvents(page = 1, limit = 20) {
    await this.eventsService.autoCompleteExpiredEvents();
    const skip = (page - 1) * limit;
    const [total, events] = await Promise.all([
      this.prisma.event.count(),
      this.prisma.event.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tickets: true, orders: true } },
          tiers: { select: { name: true, price: true, totalQuantity: true, soldQuantity: true } },
        },
      }),
    ]);

    return {
      data: events.map((e: (typeof events)[number]) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        description: e.description,
        imageUrl: e.imageUrl ?? null,
        venue: e.venue,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        maxCapacity: (e as any).maxCapacity ?? null,
        ticketsSold: e._count.tickets,
        ordersCount: e._count.orders,
        lowestPrice: e.tiers.length > 0
          ? Math.min(...e.tiers.map((t: (typeof e.tiers)[number]) => Number(t.price)))
          : null,
        tiers: e.tiers.map((t: (typeof e.tiers)[number]) => ({
          name: t.name,
          totalQuantity: t.totalQuantity,
          soldQuantity: t.soldQuantity,
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

  async createTier(eventId: string, dto: CreateTierDto) {
    return this.tiersService.create(eventId, dto);
  }

  async updateTier(tierId: string, dto: UpdateTierDto) {
    return this.tiersService.update(tierId, dto);
  }

  async deleteTier(tierId: string) {
    return this.tiersService.delete(tierId);
  }

  // ── Orders ──────────────────────────────────────────────────────────────

  async listOrders(eventId?: string, status?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

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
      pending: ['pending_payment', 'pending_review'],
      failed: ['rejected'],
      cancelled: ['cancelled'],
    };

    const orderStatusFilter = safeStatus ? orderStatusMap[safeStatus] : undefined;
    const regStatusFilter   = safeStatus ? (regStatusMap[safeStatus] ?? []) : undefined;

    const orderWhere = {
      ...(eventId ? { eventId } : {}),
      ...(orderStatusFilter ? { status: { in: orderStatusFilter as any } } : {}),
    };

    const regWhere = {
      ...(eventId ? { eventId } : {}),
      ...(regStatusFilter && regStatusFilter.length
        ? { status: { in: regStatusFilter as any } }
        : {}),
    };

    // Skip the registration query entirely when the status filter has no registration equivalent.
    const includeRegs = !safeStatus || (regStatusFilter && regStatusFilter.length > 0);

    const [orders, registrations] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          event: { select: { title: true, slug: true } },
        },
      }),
      includeRegs
        ? this.prisma.registration.findMany({
            where: regWhere,
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { email: true, firstName: true, lastName: true } },
              event: { select: { title: true, slug: true } },
            },
          })
        : Promise.resolve([] as any[]),
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

    const normalizedRegs: NormalizedRow[] = registrations.map((r: any) => ({
      id: r.id,
      source: 'registration',
      reference: r.referenceNumber,
      userEmail: r.user.email,
      userName: `${r.user.firstName} ${r.user.lastName}`,
      eventTitle: r.event.title,
      eventSlug: r.event.slug,
      // Normalise to a UI-friendly status so the frontend badge logic is consistent.
      status: r.status === 'verified' ? 'paid'
            : ['pending_payment', 'pending_review'].includes(r.status) ? 'pending'
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

  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
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

  async resendTicket(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
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
    const fromName = this.config.get<string>('resend.fromName') ?? 'Axon Tickets';
    const fromEmail = this.config.get<string>('resend.fromEmail') ?? '';

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

    const { error } = await this.resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject: `Your tickets for ${event.title}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
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
        </div>
      `,
    });

    if (error) {
      this.logger.warn({ msg: 'Failed to send ticket confirmation', toEmail, error: error.message });
    }
  }

  async checkIn(qrToken: string, adminId: string) {
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

      if (attendee.registration.status !== 'verified') {
        throw new BadRequestException(
          `Registration is not verified (status: ${attendee.registration.status})`,
        );
      }

      if (attendee.checkedInAt) {
        throw new ConflictException(
          `Already checked in at ${attendee.checkedInAt.toISOString()}`,
        );
      }

      const now = new Date();
      await this.prisma.attendee.update({
        where: { id: attendee.id },
        data: { checkedInAt: now, checkedInById: adminId, checkInMethod: 'scan' },
      });

      await this.audit.log({
        action: 'CHECKIN_SCAN',
        entityType: 'Attendee',
        entityId: attendee.id,
        registrationId: attendee.registrationId,
        performedById: adminId,
        metadata: { eventId: attendeePayload.eventId, checkInMethod: 'scan' },
      });

      return {
        valid: true,
        attendeeName: `${attendee.firstName} ${attendee.lastName}`,
        tierName: attendee.registration.tierName ?? null,
        eventTitle: attendee.registration.event.title,
        checkedInAt: now.toISOString(),
        checkInMethod: 'scan',
      };
    }

    // ── Path B: Legacy Ticket QR token (PayMongo / online order flow) ───────
    const payload = verifyQrToken(qrToken, qrSecret);
    if (!payload) throw new BadRequestException('Invalid QR code');

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: payload.ticketId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        ticketTier: { select: { name: true } },
        event: { select: { title: true } },
        order: { select: { status: true, paymentMethod: true } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'used') {
      throw new ConflictException(
        `Already checked in at ${ticket.checkedInAt?.toISOString()}`,
      );
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException(`Ticket is ${ticket.status}`);
    }

    if (ticket.userId !== payload.userId || ticket.eventId !== payload.eventId) {
      throw new BadRequestException('QR token mismatch');
    }

    const now = new Date();
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'used', checkedInAt: now, checkedInById: adminId },
    });

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

    const where: Prisma.AttendeeWhereInput = {
      registration: { eventId },
    };

    if (q?.trim()) {
      const term = q.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { registration: { referenceNumber: { contains: term, mode: 'insensitive' } } },
      ];
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
        },
      }),
    ]);

    return {
      data: attendees.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        tierName: a.registration.tierName ?? null,
        referenceNumber: a.registration.referenceNumber,
        eventTitle: a.registration.event.title,
        registrationStatus: a.registration.status,
        checkedInAt: a.checkedInAt?.toISOString() ?? null,
        hasQr: !!a.qrToken,
      })),
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  /**
   * P6-05 (manual path) — Check in an attendee by ID (manual lookup, no QR scan).
   */
  async checkinManual(attendeeId: string, adminId: string) {
    const attendee = await this.prisma.attendee.findUnique({
      where: { id: attendeeId },
      include: {
        registration: {
          select: {
            id: true,
            status: true,
            tierName: true,
            event: { select: { title: true } },
          },
        },
      },
    });

    if (!attendee) throw new NotFoundException('Attendee not found');
    if (attendee.registration.status !== 'verified') {
      throw new BadRequestException(
        `Registration is not verified (status: ${attendee.registration.status})`,
      );
    }
    if (attendee.checkedInAt) {
      throw new ConflictException(
        `Already checked in at ${attendee.checkedInAt.toISOString()}`,
      );
    }

    const now = new Date();
    await this.prisma.attendee.update({
      where: { id: attendeeId },
      data: { checkedInAt: now, checkedInById: adminId, checkInMethod: 'manual' },
    });

    await this.audit.log({
      action: 'CHECKIN_MANUAL',
      entityType: 'Attendee',
      entityId: attendeeId,
      registrationId: attendee.registrationId,
      performedById: adminId,
      metadata: { checkInMethod: 'manual' },
    });

    return {
      valid: true,
      attendeeName: `${attendee.firstName} ${attendee.lastName}`,
      tierName: attendee.registration.tierName ?? null,
      eventTitle: attendee.registration.event.title,
      checkedInAt: now.toISOString(),
      checkInMethod: 'manual',
    };
  }

  async getAttendees(eventId: string, page = 1, limit = 50, q?: string) {
    const skip = (page - 1) * limit;
    const term = q?.trim();

    // ── Path A: Registration flow (Attendee records from verified registrations) ──
    const attendeeWhere: Prisma.AttendeeWhereInput = {
      registration: { eventId, status: 'verified' },
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
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
        include: {
          registration: { select: { tierName: true, paymentMethod: true, status: true } },
        },
      }),
      this.prisma.ticket.findMany({
        where: ticketWhere,
        orderBy: { createdAt: 'desc' },
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
        userCity: null as string | null,
        userPhone: a.phone ?? null,
        tierName: a.registration.tierName ?? 'Registration',
        orderStatus: a.registration.status === 'verified' ? 'paid' : 'pending',
        paymentMethod: a.registration.paymentMethod ?? null,
        status: a.checkedInAt ? 'used' : 'valid',
        checkedInAt: a.checkedInAt?.toISOString() ?? null,
      })),
      ...tickets.map((t) => ({
        id: t.id,
        userEmail: t.user.email,
        userName: `${t.user.firstName} ${t.user.lastName}`,
        userCompany: t.user.company ?? null,
        userJobTitle: t.user.jobTitle ?? null,
        userCity: t.user.city ?? null,
        userPhone: t.user.phone ?? null,
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

  async getEventAnalytics(eventId: string) {
    const [
      event,
      orderRevenueStats,
      registrationRevenueStats,
      checkedInTickets,
      validTickets,
      checkedInAttendees,
      verifiedAttendees,
      pendingRegistrations,
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
      tierBreakdown: event.tiers.map((tier: (typeof event.tiers)[number]) => ({
        tierId: tier.id,
        tierName: tier.name,
        totalQuantity: tier.totalQuantity,
        soldQuantity: tier.soldQuantity,
        available: Math.max(0, tier.totalQuantity - tier.soldQuantity),
        price: Number(tier.price),
        revenue: Number(tier.price) * tier.soldQuantity,
        fillRate: tier.totalQuantity > 0
          ? Math.round((tier.soldQuantity / tier.totalQuantity) * 100)
          : 0,
      })),
    };
  }

  /**
   * P7 — Daily revenue + sales timeline for an event (last N days).
   * Returns one row per calendar day in the requested range.
   */
  async getEventTimeline(eventId: string, days = 14) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');

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

  async manualConfirmPayment(orderId: string, adminId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') throw new BadRequestException('Order is already paid');

    // Reuse the same confirmPayment logic (generates QR tickets + sends email)
    await this.ordersService.confirmPayment(orderId, `manual:${adminId}`);

    // Record audit trail
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        confirmedByAdminId: adminId,
        confirmedAt: new Date(),
      },
    });

    this.logger.log({ msg: 'Order manually confirmed by admin', orderId, adminId });
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

  async exportOrders(eventId?: string): Promise<string> {
    const [orders, registrations] = await Promise.all([
      this.prisma.order.findMany({
        where: eventId ? { eventId } : {},
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
          status: 'verified',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true, company: true, jobTitle: true, city: true } },
          event: { select: { title: true } },
          attendees: { select: { id: true } },
        },
      }),
    ]);

    const header = 'Source,Reference,Event,Buyer Name,Email,Company,Job Title,City,Status,Tier,Qty,Total (PHP),Payment Method,Created At\n';

    const orderRows = orders.map((o: (typeof orders)[number]) => {
      const tierNames = o.items.map((i: (typeof o.items)[number]) => `${i.ticketTier.name} x${i.quantity}`).join(' | ');
      const qty = o.items.reduce((sum: number, i: (typeof o.items)[number]) => sum + i.quantity, 0);
      return [
        'Online (PayMongo)',
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
        (Number(o.total) / 100).toFixed(2),
        o.paymentMethod ?? '',
        o.createdAt.toISOString(),
      ].join(',');
    });

    const regRows = registrations.map((r: any) => [
      'Manual (GCash/Bank)',
      this.escapeCsvCell(r.referenceNumber),
      `"${this.escapeCsvCell(r.event.title)}"`,
      `"${this.escapeCsvCell(`${r.user.firstName} ${r.user.lastName}`)}"`,
      this.escapeCsvCell(r.user.email),
      `"${this.escapeCsvCell(r.user.company ?? '')}"`,
      `"${this.escapeCsvCell(r.user.jobTitle ?? '')}"`,
      `"${this.escapeCsvCell(r.user.city ?? '')}"`,
      'paid',
      `"${this.escapeCsvCell(r.tierName ?? 'Registration')}"`,
      r.attendeeCount,
      (Number(r.total) / 100).toFixed(2),
      r.paymentMethod ?? '',
      r.createdAt.toISOString(),
    ].join(','));

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

    const header = 'ID,Name,Email,Phone,Company,Job Title,City,Tier,Payment Status,Payment Method,Checked In,Checked In At\n';

    const attendeeRows = attendees.map((a) => [
      a.id,
      `"${this.escapeCsvCell(`${a.firstName} ${a.lastName}`)}"`,
      this.escapeCsvCell(a.email),
      this.escapeCsvCell(a.phone ?? ''),
      `"${this.escapeCsvCell(a.company ?? '')}"`,
      `"${this.escapeCsvCell(a.jobTitle ?? '')}"`,
      `"${this.escapeCsvCell(a.registration.user?.city ?? '')}"`,
      `"${this.escapeCsvCell(a.registration.tierName ?? 'Registration')}"`,

      a.registration.status === 'verified' ? 'paid' : 'pending',
      this.escapeCsvCell(a.registration.paymentMethod ?? ''),
      a.checkedInAt ? 'Yes' : 'No',
      a.checkedInAt?.toISOString() ?? '',
    ].join(','));

    const ticketRows = tickets.map((t) => [
      t.id,
      `"${this.escapeCsvCell(`${t.user.firstName} ${t.user.lastName}`)}"`,
      this.escapeCsvCell(t.user.email),
      this.escapeCsvCell(t.user.phone ?? ''),
      `"${this.escapeCsvCell(t.user.company ?? '')}"`,
      `"${this.escapeCsvCell(t.user.jobTitle ?? '')}"`,
      `"${this.escapeCsvCell(t.user.city ?? '')}"`,
      `"${this.escapeCsvCell(t.ticketTier.name)}"`,
      t.order?.status ?? '',
      t.order?.paymentMethod ?? '',
      t.status === 'used' ? 'Yes' : 'No',
      t.checkedInAt?.toISOString() ?? '',
    ].join(','));

    return header + [...attendeeRows, ...ticketRows].join('\n');
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
      'Reference,First Name,Last Name,Email,Phone,Tier,Qty,Status,Payment Method,Total (PHP),Registered At,Checked In,First Check-In At\n';

    const rows = registrations.map((reg) => {
      const lead = reg.attendees.find((a) => a.isLead) ?? reg.attendees[0];
      const checkedInCount = reg.attendees.filter((a) => a.checkedInAt !== null).length;
      const firstCheckedInAt = reg.attendees
        .filter((a): a is typeof a & { checkedInAt: Date } => a.checkedInAt !== null)
        .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime())[0]
        ?.checkedInAt;

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
        reg.total.toString(),
        reg.createdAt.toISOString(),
        `${checkedInCount}/${reg.attendeeCount}`,
        firstCheckedInAt?.toISOString() ?? '',
      ].join(',');
    });

    return header + rows.join('\n');
  }

  // ── Dashboard Stats ─────────────────────────────────────────────────────

  async getDashboardStats(eventId?: string) {
    // Build an explicit eventId filter so every query uses a direct scalar
    // comparison rather than a relation-based filter, which is unambiguous.
    // For the global dashboard we resolve all completed-event IDs up front;
    // no record from a non-completed event can ever slip through.
    let scopeFilter: { eventId: string } | { eventId: { in: string[] } };

    if (eventId) {
      scopeFilter = { eventId };
    } else {
      const completedEvents = await this.prisma.event.findMany({
        where: { status: 'completed' },
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
}
