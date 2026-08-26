import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateAttendeeQrToken } from '@axon-tickets/utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Query both sources in parallel
    const [orderTickets, attendeeTickets] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { title: true, slug: true, startsAt: true, venue: true, imageUrl: true } },
          ticketTier: { select: { name: true } },
        },
      }),
      this.prisma.attendee.findMany({
        where: {
          registration: { userId, status: 'verified' },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          registration: {
            select: {
              id: true,
              tierName: true,
              lineItems: { where: { kind: 'inclusion' }, select: { quantity: true, total: true } },
              event: { select: { title: true, slug: true, startsAt: true, venue: true, imageUrl: true } },
            },
          },
        },
      }),
    ]);

    const orderItems = orderTickets.map((t) => ({
      id: t.id,
      source: 'order' as const,
      eventTitle: t.event.title,
      eventSlug: t.event.slug,
      eventStartsAt: t.event.startsAt.toISOString(),
      eventVenue: t.event.venue,
      eventImageUrl: t.event.imageUrl ?? null,
      tierName: t.ticketTier.name,
      qrToken: t.qrCode,
      status: t.status,
      checkedInAt: t.checkedInAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    }));

    const regItems = attendeeTickets.map((a) => ({
      id: `att_${a.id}`,
      source: 'registration' as const,
      eventTitle: a.registration.event.title,
      eventSlug: a.registration.event.slug,
      eventStartsAt: a.registration.event.startsAt.toISOString(),
      eventVenue: a.registration.event.venue,
      eventImageUrl: a.registration.event.imageUrl ?? null,
      tierName: a.registration.tierName ?? '',
      attendeeName: `${a.firstName} ${a.lastName}`,
      qrToken: a.qrToken ?? '',
      status: a.checkedInAt ? 'used' : a.qrToken ? 'valid' : 'pending_qr',
      checkedInAt: a.checkedInAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      inclusionCount: (a.registration.lineItems ?? []).reduce((sum, item) => sum + item.quantity, 0),
      inclusionSubtotal: (a.registration.lineItems ?? []).reduce((sum, item) => sum + Number(item.total), 0),
    }));

    // Merge and sort by event start date descending
    const all = [...orderItems, ...regItems].sort(
      (a, b) => +new Date(b.eventStartsAt) - +new Date(a.eventStartsAt),
    );

    const total = all.length;
    const paged = all.slice(skip, skip + limit);

    return {
      data: paged,
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
      source: 'order',
      eventTitle: ticket.event.title,
      eventSlug: ticket.event.slug,
      eventStartsAt: ticket.event.startsAt.toISOString(),
      eventVenue: ticket.event.venue,
      eventImageUrl: ticket.event.imageUrl ?? null,
      tierName: ticket.ticketTier.name,
      qrToken: ticket.qrCode,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  async findOneAttendee(attendeeId: string, userId: string) {
    const attendee = await this.prisma.attendee.findFirst({
      where: {
        id: attendeeId,
        registration: { userId, status: 'verified' },
      },
      include: {
        registration: {
          select: {
            id: true,
            tierName: true,
            currency: true,
            lineItems: {
              where: { kind: 'inclusion' },
              include: { attendee: true, fulfillments: true },
              orderBy: { createdAt: 'asc' },
            },
            event: { select: { id: true, title: true, slug: true, startsAt: true, venue: true, imageUrl: true } },
          },
        },
      },
    });
    if (!attendee) throw new NotFoundException('Ticket not found');

    // Lazily generate qrToken for verified attendees approved before
    // qrToken generation was added to the approval flow.
    let qrToken = attendee.qrToken;
    if (!qrToken) {
      const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';
      qrToken = generateAttendeeQrToken(
        {
          attendeeId: attendee.id,
          registrationId: attendee.registration.id,
          eventId: attendee.registration.event.id,
        },
        qrSecret,
      );
      await this.prisma.attendee.update({
        where: { id: attendee.id },
        data: { qrToken },
      });
    }

    return {
      id: `att_${attendee.id}`,
      source: 'registration',
      eventTitle: attendee.registration.event.title,
      eventSlug: attendee.registration.event.slug,
      eventStartsAt: attendee.registration.event.startsAt.toISOString(),
      eventVenue: attendee.registration.event.venue,
      eventImageUrl: attendee.registration.event.imageUrl ?? null,
      tierName: attendee.registration.tierName ?? '',
      attendeeName: `${attendee.firstName} ${attendee.lastName}`,
      qrToken,
      status: attendee.checkedInAt ? 'used' : 'valid',
      checkedInAt: attendee.checkedInAt?.toISOString() ?? null,
      createdAt: attendee.createdAt.toISOString(),
      lineItems: (attendee.registration.lineItems ?? [])
        .filter((item) => !item.assignedAttendeeId || item.assignedAttendeeId === attendee.id)
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.nameSnapshot,
          variantName: item.variantSnapshot,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
          currency: attendee.registration.currency ?? 'PHP',
          attendeeId: item.assignedAttendeeId,
          attendeeName: item.attendee
            ? `${item.attendee.firstName} ${item.attendee.lastName}`
            : null,
          fulfillmentMethod: item.fulfillmentMethodSnapshot,
          fulfillmentStatus: item.fulfillments[0]?.status ?? null,
        })),
    };
  }
}
