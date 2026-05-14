import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTierDto, UpdateTierDto } from './dto/tier.dto';

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
      },
    });

    // Seed Redis inventory immediately
    await this.eventsService.seedTierInventory(tier.id, tier.totalQuantity);

    return tier;
  }

  async update(tierId: string, dto: UpdateTierDto) {
    const tier = await this.findById(tierId);
    const updated = await this.prisma.ticketTier.update({
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

    if (dto.totalQuantity !== undefined && dto.totalQuantity !== tier.totalQuantity) {
      const available = Math.max(0, dto.totalQuantity - tier.soldQuantity);
      await this.eventsService.seedTierInventory(tierId, available);
    }

    return updated;
  }

  async findById(id: string) {
    const tier = await this.prisma.ticketTier.findUnique({ where: { id } });
    if (!tier) throw new NotFoundException('Ticket tier not found');
    return tier;
  }

  async findByEvent(eventId: string) {
    return this.prisma.ticketTier.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
