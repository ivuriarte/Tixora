import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterOrganizationDto, userId: string) {
    // One active application per user — pending or approved orgs block a new submission
    const existing = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        role: 'owner',
        organization: { approvalStatus: { in: ['pending', 'approved'] } },
      },
      include: { organization: { select: { name: true, approvalStatus: true } } },
    });

    if (existing) {
      throw new ConflictException(
        `You already have an organization "${existing.organization.name}" (status: ${existing.organization.approvalStatus}).`,
      );
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          website: dto.website?.trim() ?? null,
          phone: dto.phone?.trim() ?? null,
          city: dto.city?.trim() ?? null,
          createdById: userId,
        },
      });

      await tx.organizationMember.create({
        data: { userId, organizationId: organization.id, role: 'owner' },
      });

      return organization;
    });

    await this.audit.log({
      action: 'ORGANIZER_REGISTERED',
      entityType: 'Organization',
      entityId: org.id,
      performedById: userId,
      metadata: { name: org.name },
    });

    return {
      id: org.id,
      name: org.name,
      approvalStatus: org.approvalStatus,
      createdAt: org.createdAt.toISOString(),
    };
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
            website: true,
            phone: true,
            city: true,
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
      website: org.website,
      phone: org.phone,
      city: org.city,
      approvalStatus: org.approvalStatus,
      rejectionReason: org.rejectionReason,
      approvedAt: org.approvedAt?.toISOString() ?? null,
      rejectedAt: org.rejectedAt?.toISOString() ?? null,
      createdAt: org.createdAt.toISOString(),
    };
  }

  /**
   * Returns the approval status for the user's most recently created org.
   * Used by guards and event-creation gates in later phases.
   */
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
}
