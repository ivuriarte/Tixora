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
import { CreateEventDto, UpdateEventDto } from '../events/dto/event.dto';
import { CreateTierDto, UpdateTierDto } from '../ticket-tiers/dto/tier.dto';
import { verifyQrToken } from '@tixora/utils';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly tiersService: TicketTiersService,
    private readonly config: ConfigService,
  ) {
    this.resend = new Resend(this.config.get<string>('resend.apiKey'));
  }

  // ── Events ──────────────────────────────────────────────────────────────

  async createEvent(dto: CreateEventDto, adminId: string) {
    return this.eventsService.create(dto, adminId);
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
  }

  async cancelEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return this.eventsService.update(id, { status: 'cancelled' });
  }

  async listEvents(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, events] = await Promise.all([
      this.prisma.event.count(),
      this.prisma.event.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tickets: true, orders: true } },
          tiers: { select: { name: true, totalQuantity: true, soldQuantity: true } },
        },
      }),
    ]);

    return {
      data: events.map((e: (typeof events)[number]) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        venue: e.venue,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        ticketsSold: e._count.tickets,
        ordersCount: e._count.orders,
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
    const where = {
      ...(eventId ? { eventId } : {}),
      ...(status ? { status: status as any } : {}),
    };

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          event: { select: { title: true, slug: true } },
        },
      }),
    ]);

    return {
      data: orders.map((o: (typeof orders)[number]) => ({
        id: o.id,
        userEmail: o.user.email,
        userName: `${o.user.firstName} ${o.user.lastName}`,
        eventTitle: o.event.title,
        eventSlug: o.event.slug,
        status: o.status,
        total: Number(o.total),
        paymentMethod: o.paymentMethod,
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
    const fromName = this.config.get<string>('resend.fromName') ?? 'Tixora';
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
          <p style="margin-top:24px;color:#9ca3af;font-size:12px">Tixora · Online Ticketing Platform</p>
        </div>
      `,
    });

    if (error) {
      this.logger.warn({ msg: 'Failed to send ticket confirmation', toEmail, error: error.message });
    }
  }

  async checkIn(qrToken: string, adminId: string) {
    const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';
    const payload = verifyQrToken(qrToken, qrSecret);
    if (!payload) throw new BadRequestException('Invalid QR code');

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: payload.ticketId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        ticketTier: { select: { name: true } },
        event: { select: { title: true } },
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

    // Verify token fields match DB record (defence in depth)
    if (ticket.userId !== payload.userId || ticket.eventId !== payload.eventId) {
      throw new BadRequestException('QR token mismatch');
    }

    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'used',
        checkedInAt: new Date(),
        checkedInById: adminId,
      },
    });

    return {
      valid: true,
      attendeeName: `${ticket.user.firstName} ${ticket.user.lastName}`,
      tierName: ticket.ticketTier.name,
      eventTitle: ticket.event.title,
      checkedInAt: new Date().toISOString(),
    };
  }

  // ── Attendees ──────────────────────────────────────────────────────────

  async getAttendees(eventId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, tickets] = await Promise.all([
      this.prisma.ticket.count({ where: { eventId, status: { in: ['valid', 'used'] } } }),
      this.prisma.ticket.findMany({
        where: { eventId, status: { in: ['valid', 'used'] } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          ticketTier: { select: { name: true } },
        },
      }),
    ]);

    return {
      data: tickets.map((t: (typeof tickets)[number]) => ({
        id: t.id,
        userEmail: t.user.email,
        userName: `${t.user.firstName} ${t.user.lastName}`,
        tierName: t.ticketTier.name,
        status: t.status,
        checkedInAt: t.checkedInAt?.toISOString() ?? null,
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

  // ── Analytics ──────────────────────────────────────────────────────────

  async getEventAnalytics(eventId: string) {
    const [event, ticketStats, revenueStats] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: eventId },
        include: { tiers: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['ticketTierId', 'status'],
        where: { eventId },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: { eventId, status: 'paid' },
        _sum: { total: true, fees: true },
        _count: { id: true },
      }),
    ]);

    if (!event) throw new NotFoundException('Event not found');

    const checkedIn = await this.prisma.ticket.count({
      where: { eventId, status: 'used' },
    });
    const validTickets = await this.prisma.ticket.count({
      where: { eventId, status: { in: ['valid', 'used'] } },
    });

    return {
      eventId,
      eventTitle: event.title,
      totalRevenue: Number(revenueStats._sum.total ?? 0),
      totalFees: Number(revenueStats._sum.fees ?? 0),
      paidOrders: revenueStats._count.id,
      totalTicketsSold: validTickets,
      checkedInCount: checkedIn,
      checkInRate: validTickets > 0 ? Math.round((checkedIn / validTickets) * 100) : 0,
      tierBreakdown: event.tiers.map((tier: (typeof event.tiers)[number]) => ({
        tierId: tier.id,
        tierName: tier.name,
        totalQuantity: tier.totalQuantity,
        soldQuantity: tier.soldQuantity,
        available: Math.max(0, tier.totalQuantity - tier.soldQuantity),
        price: Number(tier.price),
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
}
