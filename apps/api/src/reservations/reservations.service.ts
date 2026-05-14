import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TicketTiersService } from '../ticket-tiers/ticket-tiers.service';
import { CreateReservationDto } from './dto/reservation.dto';

const RESERVATION_TTL_SECONDS = 15 * 60; // 15 minutes
const INVENTORY_KEY = (tierId: string) => `ticket_tier:${tierId}:available`;
const MAX_ACTIVE_RESERVATIONS = 3;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tiersService: TicketTiersService,
  ) {}

  async create(dto: CreateReservationDto, userId: string) {
    // 1. Idempotency check
    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return this.format(existing);

    // 2. Load tier
    const tier = await this.tiersService.findById(dto.tierId);
    if (!tier.isVisible) throw new BadRequestException('This ticket tier is not available');

    // 3. Check sale window
    const now = new Date();
    if (tier.saleStartsAt && now < tier.saleStartsAt) {
      throw new BadRequestException('Ticket sales have not started yet');
    }
    if (tier.saleEndsAt && now > tier.saleEndsAt) {
      throw new BadRequestException('Ticket sales have ended');
    }

    // 4. Enforce per-order limit
    if (dto.quantity > tier.maxPerOrder) {
      throw new BadRequestException(
        `Maximum ${tier.maxPerOrder} tickets per order for this tier`,
      );
    }

    // 5. Enforce per-user limit across all active reservations + paid orders
    const event = await this.prisma.event.findUnique({ where: { id: tier.eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const userTicketCount = await this.countUserTicketsForEvent(userId, tier.eventId);
    if (userTicketCount + dto.quantity > event.maxPerUser) {
      throw new BadRequestException(
        `You can purchase a maximum of ${event.maxPerUser} tickets per event`,
      );
    }

    // 6. Check active reservation count (anti-scalping)
    const activeReservations = await this.prisma.reservation.count({
      where: { userId, status: 'active' },
    });
    if (activeReservations >= MAX_ACTIVE_RESERVATIONS) {
      throw new ConflictException(
        'You have too many pending reservations. Complete or cancel them first.',
      );
    }

    // 7. Atomic inventory decrement in Redis
    const inventoryKey = INVENTORY_KEY(dto.tierId);
    const remaining = await this.redis.decrBy(inventoryKey, dto.quantity);
    if (remaining === null) {
      throw new ConflictException('Sorry, not enough tickets available');
    }

    // 8. Persist reservation
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000);
    try {
      const reservation = await this.prisma.reservation.create({
        data: {
          userId,
          ticketTierId: dto.tierId,
          eventId: tier.eventId,
          quantity: dto.quantity,
          expiresAt,
          idempotencyKey: dto.idempotencyKey,
        },
      });
      return this.format(reservation);
    } catch (err) {
      // Rollback Redis decrement on DB failure
      await this.redis.incrBy(inventoryKey, dto.quantity);
      throw err;
    }
  }

  async findOne(id: string, userId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, userId },
      include: {
        ticketTier: { select: { name: true, price: true } },
        event: { select: { title: true, slug: true, startsAt: true, venue: true } },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return {
      id: reservation.id,
      tierId: reservation.ticketTierId,
      tierName: reservation.ticketTier.name,
      eventId: reservation.eventId,
      eventTitle: reservation.event.title,
      eventSlug: reservation.event.slug,
      quantity: reservation.quantity,
      unitPrice: Number(reservation.ticketTier.price),
      total: Number(reservation.ticketTier.price) * reservation.quantity,
      expiresAt: reservation.expiresAt.toISOString(),
      status: reservation.status,
      createdAt: reservation.createdAt.toISOString(),
    };
  }

  async cancel(id: string, userId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, userId, status: 'active' },
    });
    if (!reservation) throw new NotFoundException('Active reservation not found');

    await this.prisma.reservation.update({
      where: { id },
      data: { status: 'released' },
    });

    // Return inventory to Redis
    await this.redis.incrBy(INVENTORY_KEY(reservation.ticketTierId), reservation.quantity);
  }

  /** Cron: release expired reservations every 60 seconds */
  @Cron('*/60 * * * * *')
  async releaseExpiredReservations() {
    const expired = await this.prisma.reservation.findMany({
      where: { status: 'active', expiresAt: { lt: new Date() } },
      take: 100,
    });

    if (expired.length === 0) return;

    const ids = expired.map((r) => r.id);
    await this.prisma.reservation.updateMany({
      where: { id: { in: ids } },
      data: { status: 'expired' },
    });

    // Restore Redis inventory for each tier
    const tierGroups = new Map<string, number>();
    for (const r of expired) {
      tierGroups.set(r.ticketTierId, (tierGroups.get(r.ticketTierId) ?? 0) + r.quantity);
    }
    for (const [tierId, qty] of tierGroups) {
      await this.redis.incrBy(INVENTORY_KEY(tierId), qty);
    }

    this.logger.log(`Released ${expired.length} expired reservations`);
  }

  private format(reservation: { id: string; ticketTierId: string; eventId: string; quantity: number; expiresAt: Date; status: string; createdAt: Date }) {
    return {
      id: reservation.id,
      tierId: reservation.ticketTierId,
      eventId: reservation.eventId,
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt.toISOString(),
      status: reservation.status,
      createdAt: reservation.createdAt.toISOString(),
    };
  }

  private async countUserTicketsForEvent(userId: string, eventId: string): Promise<number> {
    const [activeRes, paidTickets] = await Promise.all([
      this.prisma.reservation.aggregate({
        where: { userId, eventId, status: { in: ['active', 'converted'] } },
        _sum: { quantity: true },
      }),
      this.prisma.ticket.count({
        where: { userId, eventId, status: { in: ['valid', 'used'] } },
      }),
    ]);
    return (activeRes._sum.quantity ?? 0) + paidTickets;
  }
}
