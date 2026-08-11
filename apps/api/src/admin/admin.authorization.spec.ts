import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from '../common/guards/admin.guard';
import { EventAccessService } from '../common/services/event-access.service';

const superAdmin = { sub: 'platform-admin', email: 'admin@example.com', isAdmin: true } as any;
const organizer = { sub: 'organizer-user', email: 'organizer@example.com', isAdmin: false } as any;

function contextFor(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('Admin and super-admin authorization portfolio', () => {
  it('allows platform admins without an organizer membership lookup', async () => {
    const prisma = { organizationMember: { findFirst: jest.fn() } } as any;
    await expect(new AdminGuard(prisma).canActivate(contextFor(superAdmin))).resolves.toBe(true);
    expect(prisma.organizationMember.findFirst).not.toHaveBeenCalled();
  });

  it('allows only approved organizer members into the organizer admin shell', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce({ id: 'membership-approved' }).mockResolvedValueOnce(null);
    const guard = new AdminGuard({ organizationMember: { findFirst } } as any);
    await expect(guard.canActivate(contextFor(organizer))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor({ ...organizer, sub: 'ordinary-user' })))
      .rejects.toThrow('Admin or approved organizer access required');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization: { approvalStatus: 'approved' } }),
    }));
  });

  it('rejects anonymous access to every admin route at the guard boundary', async () => {
    const guard = new AdminGuard({ organizationMember: { findFirst: jest.fn() } } as any);
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes organizer event access to approved organizations while super admin remains cross-event', async () => {
    const findFirst = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'any-event' });
    const access = new EventAccessService({ event: { findFirst } } as any);
    expect(access.eventOwnerWhere(superAdmin)).toEqual({});
    expect(access.eventOwnerWhere(organizer)).toEqual({
      organization: {
        approvalStatus: 'approved',
        members: { some: { userId: organizer.sub } },
      },
    });
    await expect(access.assertEventAccess('foreign-event', organizer)).rejects.toBeInstanceOf(NotFoundException);
    await expect(access.assertEventAccess('any-event', superAdmin)).resolves.toBeUndefined();
  });

  it('blocks organizer accounts from platform-wide users, organizer governance, and settings', () => {
    const controller = new AdminController({} as any, {} as any);
    expect(() => controller.listUsers(organizer)).toThrow('Platform admin access required');
    expect(() => controller.listOrganizers(organizer)).toThrow('Platform admin access required');
    expect(() => controller.getPlatformSettings(organizer)).toThrow('Platform admin access required');
    expect(() => controller.setOrganizerProfileVisibility('org-1', { visible: true }, organizer))
      .toThrow('Platform admin access required');
  });

  it('allows super admin platform governance but prevents self-removal of its own role', async () => {
    const adminService = {
      listUsers: jest.fn().mockResolvedValue({ data: [] }),
      listOrganizers: jest.fn().mockResolvedValue({ data: [] }),
      getPlatformSettings: jest.fn().mockResolvedValue({ serviceFee: 50 }),
      setAdminRole: jest.fn(),
    };
    const controller = new AdminController(adminService as any, {} as any);
    await expect(controller.listUsers(superAdmin)).resolves.toEqual({ data: [] });
    await expect(controller.listOrganizers(superAdmin)).resolves.toEqual({ data: [] });
    await expect(controller.getPlatformSettings(superAdmin)).resolves.toEqual({ serviceFee: 50 });
    expect(() => controller.setUserRole(superAdmin.sub, { isAdmin: false }, superAdmin))
      .toThrow(BadRequestException);
    expect(adminService.setAdminRole).not.toHaveBeenCalled();
  });
});
