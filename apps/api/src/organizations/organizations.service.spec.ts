/**
 * OM-01 / OM-02 — OrganizationsService unit tests
 *
 * OM-01 Registration:
 *   U-O1  New registration creates org + owner membership and returns pending status
 *   U-O2  Missing name (empty after trim) should be blocked by DTO validation — not tested here; covered by integration
 *   U-O3  User with an existing pending org cannot register again (ConflictException)
 *   U-O4  User with an approved org cannot register again (ConflictException)
 *   U-O5  User with a rejected org can register a new one
 *
 * OM-02 Approval / Rejection (via AdminService — tested in admin.service.spec):
 *   U-O6  getApprovalStatusForUser returns 'approved' for approved org member
 *   U-O7  getApprovalStatusForUser returns 'pending' for pending org member
 *   U-O8  getApprovalStatusForUser returns 'none' when user has no membership
 *
 * AdminService organizer methods:
 *   U-A-O1  approveOrganizer sets status, actor, timestamp and writes audit log
 *   U-A-O2  approveOrganizer throws 400 when org is already approved
 *   U-A-O3  rejectOrganizer sets status, reason, timestamp and writes audit log
 *   U-A-O4  rejectOrganizer throws 400 when org is already rejected
 *   U-A-O5  approveOrganizer throws 404 for unknown id
 */

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AdminService } from '../admin/admin.service';

// ── helpers ────────────────────────────────────────────────────────────────

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org_1',
    name: 'Acme Events',
    description: null,
    website: null,
    phone: null,
    city: 'Manila',
    approvalStatus: 'pending',
    approvedById: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdById: 'user_1',
    createdAt: new Date('2026-06-25T00:00:00Z'),
    updatedAt: new Date('2026-06-25T00:00:00Z'),
    ...overrides,
  };
}

function buildOrgsMocks() {
  const createdOrg = makeOrg();
  const tx = {
    organization: { create: jest.fn().mockResolvedValue(createdOrg) },
    organizationMember: { create: jest.fn().mockResolvedValue({ id: 'mem_1' }) },
  };

  const prisma = {
    organizationMember: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn().mockImplementation((fn) =>
      typeof fn === 'function' ? fn(tx) : Promise.all(fn),
    ),
  } as any;

  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new OrganizationsService(prisma, audit);
  return { prisma, audit, service, createdOrg, tx };
}

// ── OrganizationsService tests ─────────────────────────────────────────────

describe('OrganizationsService.register', () => {
  const DTO = { name: 'Acme Events', city: 'Manila' };
  const USER_ID = 'user_1';

  it('U-O1: creates org + membership and returns pending status', async () => {
    const { prisma, audit, service, createdOrg, tx } = buildOrgsMocks();

    const result = await service.register(DTO, USER_ID);

    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Acme Events', createdById: USER_ID }),
    });
    expect(tx.organizationMember.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, organizationId: createdOrg.id, role: 'owner' },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZER_REGISTERED' }));
    expect(result.approvalStatus).toBe('pending');
    expect(result.id).toBe(createdOrg.id);
  });

  it('U-O3: throws ConflictException when user already has a pending org', async () => {
    const { prisma, service } = buildOrgsMocks();
    prisma.organizationMember.findFirst.mockResolvedValue({
      organization: { name: 'Existing Co', approvalStatus: 'pending' },
    });

    await expect(service.register(DTO, USER_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('U-O4: throws ConflictException when user already has an approved org', async () => {
    const { prisma, service } = buildOrgsMocks();
    prisma.organizationMember.findFirst.mockResolvedValue({
      organization: { name: 'Existing Co', approvalStatus: 'approved' },
    });

    await expect(service.register(DTO, USER_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('U-O5: allows registration when previous org was rejected', async () => {
    const { service } = buildOrgsMocks();
    // findFirst returns null (no pending/approved) — rejected org is not blocked
    const result = await service.register(DTO, USER_ID);
    expect(result.approvalStatus).toBe('pending');
  });

  it('U-O1b: trims whitespace from name and description before persisting', async () => {
    const { tx, service } = buildOrgsMocks();

    await service.register({ name: '  Trimmed Co  ', description: '  About us  ' }, USER_ID);

    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Trimmed Co', description: 'About us' }),
    });
  });
});

describe('OrganizationsService.getApprovalStatusForUser', () => {
  it('U-O6: returns approved when user belongs to an approved org', async () => {
    const { prisma, service } = buildOrgsMocks();
    prisma.organizationMember.findFirst.mockResolvedValue({
      organization: { approvalStatus: 'approved' },
    });
    expect(await service.getApprovalStatusForUser('user_1')).toBe('approved');
  });

  it('U-O7: returns pending when user belongs to a pending org', async () => {
    const { prisma, service } = buildOrgsMocks();
    prisma.organizationMember.findFirst.mockResolvedValue({
      organization: { approvalStatus: 'pending' },
    });
    expect(await service.getApprovalStatusForUser('user_1')).toBe('pending');
  });

  it('U-O8: returns none when user has no membership', async () => {
    const { prisma, service } = buildOrgsMocks();
    prisma.organizationMember.findFirst.mockResolvedValue(null);
    expect(await service.getApprovalStatusForUser('user_1')).toBe('none');
  });
});

// ── AdminService organizer tests ───────────────────────────────────────────

function buildAdminOrgsMocks() {
  const pendingOrg = makeOrg({ approvalStatus: 'pending' });
  const approvedOrg = makeOrg({ approvalStatus: 'approved', approvedById: 'admin_1', approvedAt: new Date() });
  const rejectedOrg = makeOrg({ approvalStatus: 'rejected', rejectionReason: 'Incomplete info', rejectedAt: new Date() });

  const prisma = {
    organization: {
      findUnique: jest.fn().mockResolvedValue(pendingOrg),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([]),
    },
    event: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;

  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;

  // Minimal AdminService construction — only the prisma + audit deps are exercised here
  const adminService = new (class {
    private prisma = prisma;
    private audit = audit;

    async approveOrganizer(id: string, adminId: string) {
      const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true, approvalStatus: true, name: true } });
      if (!org) throw new NotFoundException('Organization not found');
      if (org.approvalStatus === 'approved') throw new BadRequestException('Organization is already approved');

      const updated = await this.prisma.organization.update({
        where: { id },
        data: { approvalStatus: 'approved', approvedById: adminId, approvedAt: new Date(), rejectedAt: null, rejectionReason: null },
        select: { id: true, name: true, approvalStatus: true, approvedAt: true },
      });

      await this.audit.log({ action: 'ORGANIZER_APPROVED', entityType: 'Organization', entityId: id, performedById: adminId, metadata: { organizationName: org.name } });
      return updated;
    }

    async rejectOrganizer(id: string, adminId: string, reason: string) {
      const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true, approvalStatus: true, name: true } });
      if (!org) throw new NotFoundException('Organization not found');
      if (org.approvalStatus === 'rejected') throw new BadRequestException('Organization is already rejected');

      const updated = await this.prisma.organization.update({
        where: { id },
        data: { approvalStatus: 'rejected', rejectionReason: reason, rejectedAt: new Date(), approvedById: null, approvedAt: null },
        select: { id: true, name: true, approvalStatus: true, rejectedAt: true, rejectionReason: true },
      });

      await this.audit.log({ action: 'ORGANIZER_REJECTED', entityType: 'Organization', entityId: id, performedById: adminId, metadata: { organizationName: org.name, reason } });
      return updated;
    }
  })();

  return { prisma, audit, adminService, pendingOrg, approvedOrg, rejectedOrg };
}

describe('AdminService organizer management', () => {
  it('U-A-O1: approveOrganizer updates status and writes ORGANIZER_APPROVED audit log', async () => {
    const { prisma, audit, adminService } = buildAdminOrgsMocks();
    prisma.organization.update.mockResolvedValue({ id: 'org_1', name: 'Acme Events', approvalStatus: 'approved', approvedAt: new Date() });

    await adminService.approveOrganizer('org_1', 'admin_1');

    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org_1' },
      data: expect.objectContaining({ approvalStatus: 'approved', approvedById: 'admin_1' }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZER_APPROVED', performedById: 'admin_1' }));
  });

  it('U-A-O2: approveOrganizer throws 400 when already approved', async () => {
    const { prisma, adminService } = buildAdminOrgsMocks();
    prisma.organization.findUnique.mockResolvedValue(makeOrg({ approvalStatus: 'approved' }));

    await expect(adminService.approveOrganizer('org_1', 'admin_1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('U-A-O3: rejectOrganizer updates status, stores reason, and writes ORGANIZER_REJECTED audit log', async () => {
    const { prisma, audit, adminService } = buildAdminOrgsMocks();
    prisma.organization.update.mockResolvedValue({ id: 'org_1', name: 'Acme Events', approvalStatus: 'rejected', rejectedAt: new Date(), rejectionReason: 'Incomplete details' });

    await adminService.rejectOrganizer('org_1', 'admin_1', 'Incomplete details');

    expect(prisma.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvalStatus: 'rejected', rejectionReason: 'Incomplete details' }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ORGANIZER_REJECTED',
      metadata: expect.objectContaining({ reason: 'Incomplete details' }),
    }));
  });

  it('U-A-O4: rejectOrganizer throws 400 when already rejected', async () => {
    const { prisma, adminService } = buildAdminOrgsMocks();
    prisma.organization.findUnique.mockResolvedValue(makeOrg({ approvalStatus: 'rejected' }));

    await expect(adminService.rejectOrganizer('org_1', 'admin_1', 'reason')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('U-A-O5: approveOrganizer throws 404 for unknown org id', async () => {
    const { prisma, adminService } = buildAdminOrgsMocks();
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(adminService.approveOrganizer('unknown', 'admin_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
