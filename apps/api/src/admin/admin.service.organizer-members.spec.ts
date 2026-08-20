import { AdminService } from './admin.service';

describe('AdminService organizer team removal', () => {
  function makeService(member: any) {
    const prisma = {
      organizationMember: {
        findFirst: jest.fn().mockResolvedValue(member),
        delete: jest.fn().mockResolvedValue({}),
      },
      organizationInvitation: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workspaceItem: {
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      workspaceMember: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new AdminService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      audit,
      {} as any,
    );
    return { prisma, audit, service };
  }

  it('unassigns RACI tasks and removes workspace access before deleting an active member', async () => {
    const member = {
      id: 'member_1',
      userId: 'user_2',
      role: 'manager',
      organization: { id: 'org_1', name: 'Axon Events' },
      user: { email: 'manager@example.com' },
    };
    const { prisma, audit, service } = makeService(member);

    await expect(service.removeOrganizerMember('org_1', 'member_1', 'admin_1')).resolves.toEqual({
      deleted: true,
      unassignedTaskCount: 3,
    });

    expect(prisma.workspaceItem.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.workspaceMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', workspace: { event: { organizationId: 'org_1' } } },
    });
    expect(prisma.organizationMember.delete).toHaveBeenCalledWith({ where: { id: 'member_1' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ORGANIZER_MEMBER_REMOVED',
      metadata: expect.objectContaining({ unassignedTaskCount: 3 }),
    }));
  });

  it('revokes a pending invitation without touching workspace assignments', async () => {
    const { prisma, service } = makeService(null);
    prisma.organizationInvitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      email: 'invitee@example.com',
      role: 'member',
      organization: { name: 'Axon Events' },
    });
    prisma.organizationInvitation.update.mockResolvedValue({});

    await expect(service.removeOrganizerMember('org_1', 'invite_1', 'admin_1')).resolves.toEqual({
      deleted: true,
      invitationRevoked: true,
    });

    expect(prisma.organizationInvitation.update).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: { status: 'revoked' },
    });
    expect(prisma.workspaceItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
  });
});
