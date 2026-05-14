import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { TicketTiersService } from '../ticket-tiers/ticket-tiers.service';
import { CreateEventDto, UpdateEventDto } from '../events/dto/event.dto';
import { CreateTierDto, UpdateTierDto } from '../ticket-tiers/dto/tier.dto';
import { verifyQrToken } from '@tixora/utils';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly tiersService: TicketTiersService,
    private readonly config: ConfigService,
  ) {}

  // ── Events ──────────────────────────────────────────────────────────────

  async createEvent(dto: CreateEventDto, adminId: string) {
    return this.eventsService.create(dto, adminId);
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
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
      data: events.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        venue: e.venue,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        ticketsSold: e._count.tickets,
        ordersCount: e._count.orders,
        tiers: e.tiers.map((t) => ({
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
      data: orders.map((o) => ({
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

  // ── Check-in ──────────────────────────────────────────────────────────

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
      data: tickets.map((t) => ({
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
      tierBreakdown: event.tiers.map((tier) => ({
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
      data: flags.map((f) => ({
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
