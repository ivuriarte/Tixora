import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '@axon-tickets/types';

@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  eventOwnerWhere(user: JwtPayload): Prisma.EventWhereInput {
    return user.isAdmin
      ? {}
      : {
          organization: {
            approvalStatus: 'approved',
            members: { some: { userId: user.sub } },
          },
        };
  }

  async assertEventAccess(eventId: string, user: JwtPayload): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, ...this.eventOwnerWhere(user) },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');
  }

  async assertRegistrationAccess(registrationId: string, user: JwtPayload): Promise<void> {
    if (user.isAdmin) return;
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { eventId: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    await this.assertEventAccess(reg.eventId, user);
  }
}
