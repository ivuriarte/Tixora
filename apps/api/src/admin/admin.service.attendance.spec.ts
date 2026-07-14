import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['attendee_id', 'event_id', 'check_in_date'] },
    });
    const tx = {
      attendeeAttendance: {
        create: jest.fn().mockRejectedValue(duplicate),
        findFirst: jest.fn().mockResolvedValue({ checkedInAt: new Date('2026-07-14T01:00:00.000Z') }),
      },
      attendee: {
        updateMany: jest.fn(),
      },
    };

    await expect(
      service.createDailyAttendance(
        tx,
        { id: 'att_1', registrationId: 'reg_1' },
        'evt_1',
        'admin_1',
        'manual',
        new Date('2026-07-14T02:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.attendee.updateMany).not.toHaveBeenCalled();
  });
});
