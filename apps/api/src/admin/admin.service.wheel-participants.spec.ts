import { AdminService } from './admin.service';

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    attendee: { findMany: jest.fn().mockResolvedValue([]) },
    ticket: { findMany: jest.fn() },
    ...overrides,
  };
  return {
    service: new AdminService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      { log: jest.fn() } as any,
      {} as any,
    ) as any,
    prisma,
  };
}

describe('AdminService.getWheelParticipants', () => {
  it('returns checked-in attendees from the registration path', async () => {
    const attendees = [
      { id: 'att_1', firstName: 'Maria', lastName: 'Santos' },
      { id: 'att_2', firstName: 'Juan', lastName: 'dela Cruz' },
    ];
    const { service, prisma } = makeService({
      attendee: { findMany: jest.fn().mockResolvedValue(attendees) },
    });

    const result = await service.getWheelParticipants('evt_1');

    expect(result.eventId).toBe('evt_1');
    expect(result.total).toBe(2);
    expect(result.participants).toEqual([
      { id: 'att_1', name: 'Maria Santos' },
      { id: 'att_2', name: 'Juan dela Cruz' },
    ]);
    expect(prisma.attendee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'evt_1',
          OR: [
            { checkedInAt: { not: null } },
            { attendanceRecords: { some: {} } },
          ],
          registration: { status: 'verified' },
        }),
        select: { id: true, firstName: true, lastName: true },
      }),
    );
  });

  it('does not use legacy ticket owner names as icebreaker participants', async () => {
    const attendees = [
      { id: 'att_1', firstName: 'Juan', lastName: 'dela Cruz' },
    ];
    const ticketFindMany = jest.fn().mockResolvedValue([
      { id: 'tkt_1', user: { firstName: 'Ian', lastName: 'Uriarte' } },
    ]);
    const { service, prisma } = makeService({
      attendee: { findMany: jest.fn().mockResolvedValue(attendees) },
      ticket: { findMany: ticketFindMany },
    });

    const result = await service.getWheelParticipants('evt_3');

    expect(result.total).toBe(1);
    expect(result.participants).toEqual([
      { id: 'att_1', name: 'Juan dela Cruz' },
    ]);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('deduplicates attendee names from successful attendee check-ins', async () => {
    const attendees = [
      { id: 'att_1', firstName: 'Maria', lastName: 'Santos' },
      { id: 'att_2', firstName: 'Maria', lastName: 'Santos' },
      { id: 'att_3', firstName: 'Carlo', lastName: 'Mendoza' },
    ];
    const { service } = makeService({
      attendee: { findMany: jest.fn().mockResolvedValue(attendees) },
    });

    const result = await service.getWheelParticipants('evt_3');

    expect(result.total).toBe(2);
    expect(result.participants.map((p: { name: string }) => p.name)).toEqual([
      'Maria Santos',
      'Carlo Mendoza',
    ]);
  });

  it('skips entries with empty names', async () => {
    const attendees = [
      { id: 'att_1', firstName: '', lastName: '' },
      { id: 'att_2', firstName: null, lastName: null },
      { id: 'att_3', firstName: 'Sofia', lastName: 'Garcia' },
    ];
    const { service } = makeService({
      attendee: { findMany: jest.fn().mockResolvedValue(attendees) },
    });

    const result = await service.getWheelParticipants('evt_4');

    expect(result.total).toBe(1);
    expect(result.participants).toEqual([
      { id: 'att_3', name: 'Sofia Garcia' },
    ]);
  });

  it('returns an empty list when no one has checked in', async () => {
    const { service } = makeService();

    const result = await service.getWheelParticipants('evt_5');

    expect(result.total).toBe(0);
    expect(result.participants).toEqual([]);
  });

  it('does not expose email, phone, or demographic data', async () => {
    const { service, prisma } = makeService({
      attendee: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await service.getWheelParticipants('evt_6');

    const selectArg = prisma.attendee.findMany.mock.calls[0][0].select;
    expect(selectArg).toEqual({ id: true, firstName: true, lastName: true });
    expect(selectArg.email).toBeUndefined();
    expect(selectArg.phone).toBeUndefined();
    expect(selectArg.birthday).toBeUndefined();
    expect(selectArg.gender).toBeUndefined();
    expect(selectArg.city).toBeUndefined();
  });
});
