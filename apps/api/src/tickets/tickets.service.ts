import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, tickets] = await Promise.all([
      this.prisma.ticket.count({ where: { userId } }),
      this.prisma.ticket.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { title: true, slug: true, startsAt: true, venue: true, imageUrl: true } },
          ticketTier: { select: { name: true } },
        },
      }),
    ]);

    return {
      data: tickets.map((t: (typeof tickets)[number]) => ({
        id: t.id,
        orderId: t.orderId,
        eventId: t.eventId,
        eventTitle: t.event.title,
        eventSlug: t.event.slug,
        eventStartsAt: t.event.startsAt.toISOString(),
        eventVenue: t.event.venue,
        eventImageUrl: t.event.imageUrl,
        tierName: t.ticketTier.name,
        qrToken: t.qrCode,
        status: t.status,
        checkedInAt: t.checkedInAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
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

  async findOne(id: string, userId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, userId },
      include: {
        event: { select: { title: true, slug: true, startsAt: true, venue: true, imageUrl: true } },
        ticketTier: { select: { name: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    return {
      id: ticket.id,
      orderId: ticket.orderId,
      eventId: ticket.eventId,
      eventTitle: ticket.event.title,
      eventSlug: ticket.event.slug,
      eventStartsAt: ticket.event.startsAt.toISOString(),
      eventVenue: ticket.event.venue,
      eventImageUrl: ticket.event.imageUrl,
      tierName: ticket.ticketTier.name,
      qrToken: ticket.qrCode,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
    };
  }
}
