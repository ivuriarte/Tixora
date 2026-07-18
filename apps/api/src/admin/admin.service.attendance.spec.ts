import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService daily attendance', () => {
  function makeService() {
    return new AdminService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      { log: jest.fn() } as any,
      {} as any,
    ) as any;
  }

  it('creates one attendance record for the Manila event day and preserves the legacy first check-in marker', async () => {
    const service = makeService();
    const tx = {
      attendeeAttendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'att_day_1', ...data })),
      },
      attendee: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const now = new Date('2026-07-14T13:30:00.000Z');

    const attendance = await service.createDailyAttendance(
      tx,
      { id: 'att_1', registrationId: 'reg_1' },
      'evt_1',
      'admin_1',
      'manual',
      now,
    );

    expect(tx.attendeeAttendance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attendeeId: 'att_1',
        registrationId: 'reg_1',
        eventId: 'evt_1',
        checkInDate: new Date('2026-07-14T00:00:00.000Z'),
        checkedInAt: now,
        checkedInById: 'admin_1',
        checkInMethod: 'manual',
      }),
    });
    expect(tx.attendee.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_1', checkedInAt: null },
      data: { checkedInAt: now, checkedInById: 'admin_1', checkInMethod: 'manual' },
    });
    expect(attendance.checkInDate.toISOString().slice(0, 10)).toBe('2026-07-14');
  });

  it('reports a same-day duplicate as a conflict', async () => {
    const service = makeService();
    const checkedInAt = new Date('2026-07-14T01:00:00.000Z');
    const tx = {
      attendeeAttendance: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ checkedInAt }),
      },
      attendee: {
        updateMany: jest.fn(),
      },
    };

    let caught: unknown;
    try {
      await service.createDailyAttendance(
        tx,
        { id: 'att_1', registrationId: 'reg_1' },
        'evt_1',
        'admin_1',
        'manual',
        new Date('2026-07-14T02:00:00.000Z'),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      code: 'ALREADY_CHECKED_IN',
      message: 'This ticket has already been checked in.',
      checkedInAt: checkedInAt.toISOString(),
    });
    expect(tx.attendeeAttendance.create).not.toHaveBeenCalled();
    expect(tx.attendee.updateMany).not.toHaveBeenCalled();
  });

  it('reports a bundled P2002 race as a conflict without querying the aborted transaction again', async () => {
    const service = makeService();
    const bundledPrismaError = { code: 'P2002', message: 'Unique constraint failed' };
    const tx = {
      attendeeAttendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(bundledPrismaError),
      },
      attendee: { updateMany: jest.fn() },
    };

    await expect(
      service.createDailyAttendance(
        tx,
        { id: 'att_1', registrationId: 'reg_1' },
        'evt_1',
        'admin_1',
        'scan',
        new Date('2026-07-14T02:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.attendeeAttendance.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.attendee.updateMany).not.toHaveBeenCalled();
  });
});
