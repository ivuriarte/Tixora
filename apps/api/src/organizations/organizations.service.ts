import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { RegisterOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterOrganizationDto, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const data = {
      name: dto.name.trim(),
      description: dto.description.trim(),
      contactName: dto.contactName.trim(),
      phone: dto.phone.trim(),
      city: dto.city.trim(),
      idType: dto.idType,
      idNumber: dto.idNumber.trim(),
      organizationType: dto.organizationType,
      registrationNumber: dto.registrationNumber?.trim() ?? null,
      website: dto.website?.trim() ?? null,
      facebookUrl: dto.facebookUrl?.trim() ?? null,
    };

    // Block if user already has a pending or approved org; rejected records are reusable.
    const existing = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        role: 'owner',
        organization: { approvalStatus: { in: ['pending', 'approved', 'rejected'] } },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            approvalStatus: true,
            createdAt: true,
          },
        },
      },
    });

    if (existing?.organization.approvalStatus === 'pending' || existing?.organization.approvalStatus === 'approved') {
      throw new ConflictException(
        `You already have an organization "${existing.organization.name}" (status: ${existing.organization.approvalStatus}).`,
      );
    }

    if (existing?.organization.approvalStatus === 'rejected') {
      const organization = await this.prisma.organization.update({
        where: { id: existing.organization.id },
        data: {
          ...data,
          approvalStatus: 'pending',
          rejectionReason: null,
          rejectedAt: null,
          approvedById: null,
          approvedAt: null,
        },
      });

      await this.audit.log({
        action: 'ORGANIZER_RESUBMITTED',
        entityType: 'Organization',
        entityId: organization.id,
        performedById: userId,
        metadata: { name: organization.name, organizationType: organization.organizationType },
      }).catch(() => null);

      await this.emailService.sendOrganizerApplicationReceived(
        user.email,
        user.firstName ?? 'there',
        organization.name,
      );

      return this.toOrganizationStatus(organization);
    }

    // Sequential create — avoids $transaction(callback) which can fail with
    // PgBouncer in transaction mode (Supabase default connection pooler).
    const organization = await this.prisma.organization.create({
      data: {
        ...data,
        createdById: userId,
      },
    });

    try {
      await this.prisma.organizationMember.create({
        data: { userId, organizationId: organization.id, role: 'owner' },
      });
    } catch (e) {
      // Roll back the org if membership creation fails
      await this.prisma.organization.delete({ where: { id: organization.id } }).catch(() => null);
      throw e;
    }

    await this.audit.log({
      action: 'ORGANIZER_REGISTERED',
      entityType: 'Organization',
      entityId: organization.id,
      performedById: userId,
      metadata: { name: organization.name, organizationType: organization.organizationType },
    }).catch(() => null); // audit failure must never fail the registration

    await this.emailService.sendOrganizerApplicationReceived(
      user.email,
      user.firstName ?? 'there',
      organization.name,
    );

    return this.toOrganizationStatus(organization);
  }

  async getMyOrganization(userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, role: 'owner' },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            contactName: true,
            phone: true,
            city: true,
            idType: true,
            idNumber: true,
            organizationType: true,
            registrationNumber: true,
            website: true,
            facebookUrl: true,
            approvalStatus: true,
            rejectionReason: true,
            approvedAt: true,
            rejectedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!membership) throw new NotFoundException('No organization found for this user');

    const org = membership.organization;
    return {
      id: org.id,
      name: org.name,
      description: org.description,
      contactName: org.contactName,
      phone: org.phone,
      city: org.city,
      idType: org.idType,
      idNumber: org.idNumber,
      organizationType: org.organizationType,
      registrationNumber: org.registrationNumber,
      website: org.website,
      facebookUrl: org.facebookUrl,
      approvalStatus: org.approvalStatus,
      rejectionReason: org.rejectionReason,
      approvedAt: org.approvedAt?.toISOString() ?? null,
      rejectedAt: org.rejectedAt?.toISOString() ?? null,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async updateMyOrganization(dto: UpdateOrganizationDto, userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, role: 'owner' },
      include: {
        organization: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!membership) throw new NotFoundException('No organization found for this user');

    const data: Record<string, string | null> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.contactName !== undefined) data.contactName = dto.contactName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.idType !== undefined) data.idType = dto.idType;
    if (dto.idNumber !== undefined) data.idNumber = dto.idNumber.trim();
    if (dto.organizationType !== undefined) data.organizationType = dto.organizationType;
    if (dto.registrationNumber !== undefined) data.registrationNumber = dto.registrationNumber?.trim() || null;
    if (dto.website !== undefined) data.website = dto.website?.trim() || null;
    if (dto.facebookUrl !== undefined) data.facebookUrl = dto.facebookUrl?.trim() || null;

    await this.prisma.organization.update({
      where: { id: membership.organization.id },
      data,
    });

    await this.audit.log({
      action: 'ORGANIZER_UPDATED',
      entityType: 'Organization',
      entityId: membership.organization.id,
      performedById: userId,
      metadata: { fields: Object.keys(data) },
    }).catch(() => null);

    return this.getMyOrganization(userId);
  }

  private async requireTeamManager(userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        role: { in: ['owner', 'admin'] },
        organization: { approvalStatus: 'approved' },
      },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!membership) throw new ForbiddenException('Organization owner or admin access required');
    return membership;
  }

  async getMyTeam(userId: string) {
    const actor = await this.prisma.organizationMember.findFirst({
      where: { userId, organization: { approvalStatus: 'approved' } },
      select: { organizationId: true, role: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!actor) throw new NotFoundException('Approved organization not found');
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: actor.organizationId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isVerified: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      canManage: actor.role === 'owner' || actor.role === 'admin',
      members: members.map((member) => ({
        id: member.id,
        userId: member.user.id,
        name: [member.user.firstName, member.user.lastName].filter(Boolean).join(' ') || member.user.email,
        email: member.user.email,
        role: member.role,
        status: member.user.isVerified ? 'active' : 'pending',
        createdAt: member.createdAt.toISOString(),
      })),
    };
  }

  async addMyTeamMember(actorId: string, rawEmail: string, role: 'admin' | 'member') {
    const actor = await this.requireTeamManager(actorId);
    const email = rawEmail.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true, isVerified: true },
    });
    if (user) {
      const membershipElsewhere = await this.prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: { not: actor.organizationId } },
        select: { id: true },
      });
      if (membershipElsewhere) throw new ConflictException('This account already belongs to another organizer');
    } else {
      user = await this.prisma.user.create({
        data: { email, isVerified: false },
        select: { id: true, email: true, firstName: true, lastName: true, isVerified: true },
      });
    }
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: actor.organizationId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('This person is already on the team');
    const membership = await this.prisma.organizationMember.create({
      data: { userId: user.id, organizationId: actor.organizationId, role },
    });
    await this.audit.log({
      action: 'ORGANIZATION_MEMBER_ADDED', entityType: 'OrganizationMember', entityId: membership.id,
      performedById: actorId, metadata: { organizationId: actor.organizationId, userId: user.id, role, pendingVerification: !user.isVerified },
    }).catch(() => null);
    await this.emailService.sendOrganizationTeamInvite(email, actor.organization.name, !user.isVerified);
    return this.getMyTeam(actorId);
  }

  async updateMyTeamMember(actorId: string, memberId: string, role: 'admin' | 'member') {
    const actor = await this.requireTeamManager(actorId);
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: actor.organizationId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    if (member.role === 'owner') throw new BadRequestException('The owner role cannot be changed');
    if (actor.role === 'admin' && member.role === 'admin') throw new ForbiddenException('Only the owner can change another admin');
    await this.prisma.organizationMember.update({ where: { id: memberId }, data: { role } });
    await this.prisma.workspaceMember.updateMany({
      where: { userId: member.userId, workspace: { event: { organizationId: actor.organizationId } } },
      data: { role: role === 'admin' ? 'manager' : 'editor' },
    });
    await this.audit.log({
      action: 'ORGANIZATION_MEMBER_ROLE_CHANGED', entityType: 'OrganizationMember', entityId: memberId,
      performedById: actorId, metadata: { organizationId: actor.organizationId, from: member.role, to: role },
    }).catch(() => null);
    return this.getMyTeam(actorId);
  }

  async removeMyTeamMember(actorId: string, memberId: string) {
    const actor = await this.requireTeamManager(actorId);
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: actor.organizationId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    if (member.role === 'owner') throw new BadRequestException('The organization owner cannot be removed');
    if (member.userId === actorId) throw new BadRequestException('You cannot remove your own access');
    if (actor.role === 'admin' && member.role === 'admin') throw new ForbiddenException('Only the owner can remove another admin');

    const affected = await this.prisma.workspaceItem.count({
      where: {
        workspace: { event: { organizationId: actor.organizationId } },
        OR: [{ assignedToUserId: member.userId }, { accountableToUserId: member.userId }],
      },
    });
    await this.prisma.workspaceItem.updateMany({
      where: { workspace: { event: { organizationId: actor.organizationId } }, assignedToUserId: member.userId },
      data: { assignedToUserId: null, assignedToName: null },
    });
    await this.prisma.workspaceItem.updateMany({
      where: { workspace: { event: { organizationId: actor.organizationId } }, accountableToUserId: member.userId },
      data: { accountableToUserId: null, accountableName: null },
    });
    await this.prisma.workspaceMember.deleteMany({
      where: { userId: member.userId, workspace: { event: { organizationId: actor.organizationId } } },
    });
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    await this.audit.log({
      action: 'ORGANIZATION_MEMBER_REMOVED', entityType: 'OrganizationMember', entityId: memberId,
      performedById: actorId, metadata: { organizationId: actor.organizationId, userId: member.userId, unassignedTaskCount: affected },
    }).catch(() => null);
    return { removed: true, unassignedTaskCount: affected };
  }

  async getApprovalStatusForUser(
    userId: string,
  ): Promise<'none' | 'pending' | 'approved' | 'rejected' | 'suspended'> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
      include: { organization: { select: { approvalStatus: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!membership) return 'none';
    return membership.organization.approvalStatus as
      | 'pending'
      | 'approved'
      | 'rejected'
      | 'suspended';
  }

  private toOrganizationStatus(organization: {
    id: string;
    name: string;
    approvalStatus: string;
    rejectionReason: string | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: organization.id,
      name: organization.name,
      approvalStatus: organization.approvalStatus,
      rejectionReason: organization.rejectionReason,
      approvedAt: organization.approvedAt?.toISOString() ?? null,
      rejectedAt: organization.rejectedAt?.toISOString() ?? null,
      createdAt: organization.createdAt.toISOString(),
    };
  }
}
