import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { querySeatBreakdowns, reservedSeats, type SeatBreakdown } from '../common/seats/seat-usage';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTierDto, TierInclusionDto, UpdateTierDto } from './dto/tier.dto';

/** One sentence, identical in the spec and the UI. Counts are lowercase. */
export const describeSeatBreakdown = (b: SeatBreakdown): string =>
  `${b.confirmed} sold, ${b.awaitingReview} awaiting review, ${b.held} pending payment`;

@Injectable()
export class TicketTiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async create(eventId: string, dto: CreateTierDto) {
    await this.eventsService.findById(eventId);
    const tier = await this.prisma.ticketTier.create({
      data: {
        eventId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        totalQuantity: dto.totalQuantity,
        maxPerOrder: dto.maxPerOrder ?? 4,
        saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null,
        saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null,
        isVisible: dto.isVisible ?? true,
        sortOrder: dto.sortOrder ?? 0,
        ...(dto.inclusions !== undefined && {
          inclusions: {
            create: this.normalizeInclusions(dto.inclusions).map((item) => ({
              label: item.label,
              stubEnabled: item.stubEnabled,
              sortOrder: item.sortOrder,
            })),
          },
        }),
      },
      include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
    });

    // Seed Redis inventory immediately
    await this.eventsService.seedTierInventory(tier.id, tier.totalQuantity);

    return tier;
  }

  async update(tierId: string, dto: UpdateTierDto) {
    const tier = await this.findById(tierId);
    let liveReserved: number | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      // Capacity guard: only when the capacity actually changes. Takes the same row lock the
      // registration path takes (FOR UPDATE on the tier) BEFORE counting, so a registration
      // arriving at the same moment cannot slip under the new capacity. The pre-read value
      // above is never used for this decision (it was read outside the transaction).
      if (dto.totalQuantity !== undefined && dto.totalQuantity !== tier.totalQuantity) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM ticket_tiers WHERE id = ${tierId} FOR UPDATE`);
        const breakdown = (await querySeatBreakdowns(tx as any, [tierId])).get(tierId)!;
        liveReserved = reservedSeats(breakdown);
        if (dto.totalQuantity < liveReserved) {
          throw new ConflictException(
            `You can't go below ${liveReserved}: ${describeSeatBreakdown(breakdown)}. Wait for pending checkouts to expire, or release them in Transactions.`,
          );
        }
      }
      const saved = await tx.ticketTier.update({
        where: { id: tierId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.maxPerOrder !== undefined && { maxPerOrder: dto.maxPerOrder }),
          ...(dto.saleStartsAt !== undefined && { saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null }),
          ...(dto.saleEndsAt !== undefined && { saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null }),
          ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          // If quantity increased, re-seed Redis
          ...(dto.totalQuantity !== undefined && { totalQuantity: dto.totalQuantity }),
        },
      });

      if (dto.inclusions !== undefined) {
        await tx.ticketTierInclusion.deleteMany({ where: { tierId } });
        const inclusions = this.normalizeInclusions(dto.inclusions);
        if (inclusions.length > 0) {
          await tx.ticketTierInclusion.createMany({
            data: inclusions.map((item) => ({
              tierId,
              label: item.label,
              stubEnabled: item.stubEnabled,
              sortOrder: item.sortOrder,
            })),
          });
        }
      }

      return tx.ticketTier.findUniqueOrThrow({
        where: { id: saved.id },
        include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    if (dto.totalQuantity !== undefined && dto.totalQuantity !== tier.totalQuantity) {
      // Reseed from the live count measured under the lock, not the stored column.
      const available = Math.max(0, dto.totalQuantity - (liveReserved ?? tier.soldQuantity));
      await this.eventsService.seedTierInventory(tierId, available);
    }

    return updated;
  }

  async findById(id: string) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { id },
      include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!tier) throw new NotFoundException('Ticket tier not found');
    return tier;
  }

  async findByEvent(eventId: string) {
    return this.prisma.ticketTier.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
      include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async delete(tierId: string) {
    await this.findById(tierId);
    // Live count under the same tier row lock, so a registration cannot commit between the
    // check and the delete. 409 (was 400 on the stored column): see the spec, D4.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ticket_tiers WHERE id = ${tierId} FOR UPDATE`);
      const breakdown = (await querySeatBreakdowns(tx as any, [tierId])).get(tierId)!;
      if (reservedSeats(breakdown) > 0) {
        throw new ConflictException(
          `This tier can't be deleted yet: ${describeSeatBreakdown(breakdown)}. Wait for pending checkouts to expire or release them in Transactions.`,
        );
      }
      await tx.ticketTier.delete({ where: { id: tierId } });
    });
    return { deleted: true };
  }

  private normalizeInclusions(inclusions: TierInclusionDto[]) {
    const seen = new Set<string>();
    return inclusions
      .map((item, index) => ({
        label: item.label.trim(),
        stubEnabled: item.stubEnabled ?? true,
        sortOrder: item.sortOrder ?? index,
      }))
      .filter((item) => {
        const key = item.label.toLocaleLowerCase();
        if (!item.label || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
}
