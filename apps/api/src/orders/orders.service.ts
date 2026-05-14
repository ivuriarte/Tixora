import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { CreateOrderDto } from './dto/order.dto';
import { generateQrToken } from '@tixora/utils';
import { ConfigService } from '@nestjs/config';
import { calculateFee } from '@tixora/utils';
import { Resend } from 'resend';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.resend = new Resend(this.config.get<string>('resend.apiKey'));
  }

  async create(dto: CreateOrderDto, userId: string, ip: string, userAgent: string) {
    // Idempotency check
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { items: true },
    });
    if (existing) return this.formatOrder(existing);

    // Load reservation with tier, ensure it belongs to this user
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: dto.reservationId, userId, status: 'active' },
      include: { ticketTier: true, event: true },
    });
    if (!reservation) throw new NotFoundException('Active reservation not found or expired');
    if (new Date() > reservation.expiresAt) {
      throw new BadRequestException('Reservation has expired. Please start over.');
    }

    const unitPrice = Number(reservation.ticketTier.price);
    const subtotal = unitPrice * reservation.quantity;
    const fees = calculateFee(subtotal);
    const total = subtotal + fees;

    // Run the critical section in a DB transaction with row-level lock
    const order = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tier = await tx.$queryRaw<Array<{ sold_quantity: number; total_quantity: number }>>`
        SELECT sold_quantity, total_quantity
        FROM ticket_tiers
        WHERE id = ${reservation.ticketTierId}::uuid
        FOR UPDATE
      `;

      if (!tier[0]) throw new NotFoundException('Ticket tier not found');

      const remaining = tier[0].total_quantity - tier[0].sold_quantity;
      if (remaining < reservation.quantity) {
        throw new ConflictException('Not enough tickets available (concurrent request)');
      }

      // Update sold count on tier
      await tx.ticketTier.update({
        where: { id: reservation.ticketTierId },
        data: { soldQuantity: { increment: reservation.quantity } },
      });

      // Create order + items
      const newOrder = await tx.order.create({
        data: {
          userId,
          reservationId: reservation.id,
          eventId: reservation.eventId,
          subtotal,
          fees,
          total,
          currency: 'PHP',
          paymentMethod: dto.paymentMethod,
          idempotencyKey: dto.idempotencyKey,
          ipAddress: ip,
          userAgent,
          items: {
            create: [
              {
                ticketTierId: reservation.ticketTierId,
                quantity: reservation.quantity,
                unitPrice,
                subtotal,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Mark reservation as converted
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'converted' },
      });

      return newOrder;
    });

    // Free ticket — skip payment, generate tickets immediately
    if (total === 0) {
      await this.confirmPayment(order.id, 'free');
      return { ...this.formatOrder(order), status: 'paid' };
    }

    return this.formatOrder(order);
  }

  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: { include: { ticketTier: { select: { name: true } } } },
        event: { select: { title: true, slug: true, startsAt: true, venue: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      id: order.id,
      userId: order.userId,
      eventId: order.eventId,
      eventTitle: order.event.title,
      eventSlug: order.event.slug,
      eventStartsAt: order.event.startsAt.toISOString(),
      eventVenue: order.event.venue,
      status: order.status,
      subtotal: Number(order.subtotal),
      fees: Number(order.fees),
      total: Number(order.total),
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      items: order.items.map((item: (typeof order.items)[number]) => ({
        id: item.id,
        tierId: item.ticketTierId,
        tierName: item.ticketTier.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { title: true, slug: true, startsAt: true, venue: true, imageUrl: true } },
          items: { select: { quantity: true, unitPrice: true } },
        },
      }),
    ]);

    return {
      data: orders.map((o: (typeof orders)[number]) => ({
        id: o.id,
        eventTitle: o.event.title,
        eventSlug: o.event.slug,
        eventStartsAt: o.event.startsAt.toISOString(),
        eventVenue: o.event.venue,
        eventImageUrl: o.event.imageUrl,
        status: o.status,
        total: Number(o.total),
        currency: o.currency,
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

  /**
   * Called by PayMongo webhook after payment succeeds.
   * Generates QR tickets.
   */
  async confirmPayment(orderId: string, paymentRef: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') return; // Already processed (webhook replay)

    const qrSecret = this.config.get<string>('qr.hmacSecret') ?? '';

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'paid', paymentRef },
      });

      // Generate all ticket records in batch (avoid N+1 sequential inserts)
      const ticketRecords: Array<{
        id: string;
        orderId: string;
        orderItemId: string;
        userId: string;
        eventId: string;
        ticketTierId: string;
        qrCode: string;
      }> = [];

      for (const item of order.items) {
        for (let i = 0; i < item.quantity; i++) {
          const ticketId = crypto.randomUUID();
          const qrPayload = {
            ticketId,
            userId: order.userId,
            eventId: order.eventId,
            tierId: item.ticketTierId,
          };
          ticketRecords.push({
            id: ticketId,
            orderId,
            orderItemId: item.id,
            userId: order.userId,
            eventId: order.eventId,
            ticketTierId: item.ticketTierId,
            qrCode: generateQrToken(qrPayload, qrSecret),
          });
        }
      }

      await tx.ticket.createMany({ data: ticketRecords });
    });

    this.logger.log({ msg: 'Order confirmed and tickets generated', orderId });

    // Send confirmation email with QR codes (fire-and-forget; never throws)
    this.sendTicketConfirmationEmail(orderId).catch((err: unknown) => {
      this.logger.warn({ msg: 'Failed to send ticket confirmation email', orderId, err });
    });
  }

  private async sendTicketConfirmationEmail(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        event: { select: { title: true, startsAt: true, venue: true } },
        tickets: { select: { id: true, qrCode: true, ticketTier: { select: { name: true } } } },
      },
    });
    if (!order) return;

    const fromName = this.config.get<string>('resend.fromName') ?? 'Tixora';
    const fromEmail = this.config.get<string>('resend.fromEmail') ?? '';

    const ticketRows = order.tickets
      .map(
        (t: (typeof order.tickets)[number]) =>
          `<tr>
            <td style="padding:12px;border-bottom:1px solid #e5e7eb">${t.ticketTier.name}</td>
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
      to: order.user.email,
      subject: `Your tickets for ${order.event.title}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h1 style="color:#7c3aed;margin-bottom:4px">You're going!</h1>
          <h2 style="margin-top:0">${order.event.title}</h2>
          <p style="color:#6b7280">${new Date(order.event.startsAt).toLocaleDateString('en-PH', { dateStyle: 'full' })} · ${order.event.venue}</p>
          <p>Hi ${order.user.firstName}, here are your tickets. Show the QR code at the door.</p>
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
      this.logger.warn({ msg: 'Resend error sending ticket email', orderId, error: error.message });
    }
  }

  async markFailed(orderId: string): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'failed' },
    });
  }

  private formatOrder(order: { id: string; status: string; total: unknown; currency: string; paymentMethod: string | null; createdAt: Date }) {
    return {
      id: order.id,
      status: order.status,
      total: Number(order.total),
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
