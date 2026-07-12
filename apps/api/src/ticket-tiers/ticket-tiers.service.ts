import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTierDto, TierInclusionDto, UpdateTierDto } from './dto/tier.dto';

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
    const updated = await this.prisma.$transaction(async (tx) => {
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
      const available = Math.max(0, dto.totalQuantity - tier.soldQuantity);
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
    const tier = await this.findById(tierId);
    if (tier.soldQuantity > 0) {
      throw new BadRequestException('Cannot delete a tier that already has sold tickets');
    }
    await this.prisma.ticketTier.delete({ where: { id: tierId } });
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
