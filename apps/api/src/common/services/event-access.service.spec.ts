import { ForbiddenException } from '@nestjs/common';
import { EventAccessService } from './event-access.service';

describe('EventAccessService organizer capabilities', () => {
  const user = { sub: 'user_1', email: 'person@example.com', isAdmin: false } as any;

  it('allows the approved organization Owner to manage event assets', async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockResolvedValue({ role: 'owner' }) },
    } as any;
    const service = new EventAccessService(prisma);

    await expect(service.assertOrganizerCapability(user, 'events.manage')).resolves.toBe('owner');
  });

  it('keeps event assets view-only for Managers', async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockResolvedValue({ role: 'manager' }) },
    } as any;
    const service = new EventAccessService(prisma);

    await expect(service.assertOrganizerCapability(user, 'events.manage')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects users without an approved organizer membership', async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new EventAccessService(prisma);

    await expect(service.assertOrganizerCapability(user, 'events.manage')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows platform administrators without an organization lookup', async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn() },
    } as any;
    const service = new EventAccessService(prisma);

    await expect(service.assertOrganizerCapability({ ...user, isAdmin: true }, 'events.manage')).resolves.toBe('platform_admin');
    expect(prisma.organizationMember.findFirst).not.toHaveBeenCalled();
  });
});
