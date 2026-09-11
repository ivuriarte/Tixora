import { RegistrationsService } from './registrations.service';

function makeService() {
  const prisma = {
    registration: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new RegistrationsService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
}

describe('RegistrationsService verification queue readiness', () => {
  it('lists only registrations whose attendee step is complete', async () => {
    const { service, prisma } = makeService();

    await service.listPendingVerifications('event-1', 'proof_submitted');

    expect(prisma.registration.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        eventId: 'event-1',
        status: 'proof_submitted',
        attendeesCompletedAt: { not: null },
        attendees: { some: {} },
      }),
    });
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attendeesCompletedAt: { not: null },
          attendees: { some: {} },
        }),
      }),
    );
  });

  it('does not count incomplete payment intents or proof uploads as approval work', async () => {
    const { service, prisma } = makeService();

    await service.pendingCount();

    expect(prisma.registration.count).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending_approval', 'proof_submitted'] },
        attendeesCompletedAt: { not: null },
        attendees: { some: {} },
      },
    });
  });
});
