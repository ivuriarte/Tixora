import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { RegisterOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { Prisma } from '@prisma/client';
import { uniqueSlug } from '@axon-tickets/utils';

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
      logoUrl: dto.logoUrl?.trim() ?? null,
      socialLinks:
        (dto.socialLinks as unknown as Prisma.InputJsonValue | undefined) ??
        Prisma.JsonNull,
      isPublic: dto.isPublic ?? true,
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
          publicSlug: uniqueSlug(dto.name),
          profileUpdatedAt: new Date(),
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
        publicSlug: uniqueSlug(dto.name),
        profileUpdatedAt: new Date(),
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
            publicSlug: true,
            logoUrl: true,
            socialLinks: true,
            isPublic: true,
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
      publicSlug: org.publicSlug,
      logoUrl: org.logoUrl,
      socialLinks: org.socialLinks,
      isPublic: org.isPublic,
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

    const data: Prisma.OrganizationUpdateInput = {};
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
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl?.trim() || null;
    if (dto.socialLinks !== undefined) {
      data.socialLinks =
        (dto.socialLinks as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
    data.profileUpdatedAt = new Date();

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

  async getPublicProfile(slug: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        publicSlug: slug.trim().toLowerCase(),
        approvalStatus: 'approved',
        isPublic: true,
        hiddenAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        publicSlug: true,
        logoUrl: true,
        website: true,
        facebookUrl: true,
        socialLinks: true,
        createdAt: true,
        events: {
          where: {
            status: { in: ['on_sale', 'sold_out'] },
            startsAt: { gte: new Date() },
          },
          orderBy: { startsAt: 'asc' },
          take: 12,
          select: {
            id: true,
            slug: true,
            title: true,
            imageUrl: true,
            city: true,
            venue: true,
            startsAt: true,
            endsAt: true,
            category: true,
            eventType: true,
            isOnline: true,
            isFree: true,
            status: true,
          },
        },
      },
    });
    if (!organization) throw new NotFoundException('Organizer profile not found');
    return {
      id: organization.id,
      name: organization.name,
      about: organization.description,
      slug: organization.publicSlug,
      logoUrl: organization.logoUrl,
      website: organization.website,
      facebookUrl: organization.facebookUrl,
      socialLinks: organization.socialLinks,
      since: organization.createdAt.toLocaleDateString('en-PH', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Manila',
      }),
      upcomingEvents: organization.events.map((event) => ({
        ...event,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt?.toISOString() ?? null,
      })),
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
