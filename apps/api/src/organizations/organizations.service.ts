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
    // Block if user already has a pending or approved org
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

    // Sequential create — avoids $transaction(callback) which can fail with
    // PgBouncer in transaction mode (Supabase default connection pooler).
    const organization = await this.prisma.organization.create({
      data: {
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

    return {
      id: organization.id,
      name: organization.name,
      approvalStatus: organization.approvalStatus,
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
      createdAt: organization.createdAt.toISOString(),
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
