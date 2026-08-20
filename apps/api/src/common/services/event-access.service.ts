import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '@axon-tickets/types';
import {
  OrganizationCapability,
  OrganizationRole,
  normalizeOrganizationRole,
  organizationRoleCan,
} from '../access/organization-capabilities';

@Injectable()
export class EventAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOrganizerCapability(
    user: JwtPayload,
    capability: OrganizationCapability,
  ): Promise<OrganizationRole | 'platform_admin'> {
    if (user.isAdmin) return 'platform_admin';
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId: user.sub,
        organization: { approvalStatus: 'approved' },
      },
      select: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!membership) throw new ForbiddenException('Approved organizer access required');
    const role = normalizeOrganizationRole(membership.role);
    if (!organizationRoleCan(role, capability)) {
      throw new ForbiddenException('Your organizer role does not allow this action');
    }
    return role;
  }

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

  async getEventOrganizationRole(eventId: string, user: JwtPayload): Promise<OrganizationRole | 'platform_admin'> {
    if (user.isAdmin) return 'platform_admin';
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organization: {
          approvalStatus: 'approved',
          members: { some: { userId: user.sub } },
        },
      },
      select: {
        organization: {
          select: {
            members: {
              where: { userId: user.sub },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!event?.organization?.members[0]) throw new NotFoundException('Event not found');
    return normalizeOrganizationRole(event.organization.members[0].role);
  }

  async assertEventCapability(
    eventId: string,
    user: JwtPayload,
    capability: OrganizationCapability,
  ): Promise<OrganizationRole | 'platform_admin'> {
    const role = await this.getEventOrganizationRole(eventId, user);
    if (role !== 'platform_admin' && !organizationRoleCan(role, capability)) {
      throw new ForbiddenException('Your organizer role does not allow this action');
    }
    return role;
  }

  assertEventMutationAccess(eventId: string, user: JwtPayload) {
    return this.assertEventCapability(eventId, user, 'events.manage');
  }

  assertWorkspaceManageAccess(eventId: string, user: JwtPayload) {
    return this.assertEventCapability(eventId, user, 'workspace.manage');
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
