import {
  ACTIVE_REGISTRATION_STATUSES,
  buildSeatBreakdowns,
  querySeatBreakdowns,
  reservedSeats,
} from './seat-usage';

describe('buildSeatBreakdowns', () => {
  it('puts every status in exactly one bucket and sums attendee seats, not rows', () => {
    const map = buildSeatBreakdowns(
      ['t1'],
      [
        { tierId: 't1', status: 'verified', seats: 3 },
        { tierId: 't1', status: 'proof_submitted', seats: 1 },
        { tierId: 't1', status: 'pending_approval', seats: 2 },
        { tierId: 't1', status: 'pending_payment', seats: 7 },
      ],
      [{ tierId: 't1', count: 2 }],
    );
    expect(map.get('t1')).toEqual({ confirmed: 5, awaitingReview: 3, held: 7 });
    expect(reservedSeats(map.get('t1')!)).toBe(15);
  });

  it('counts cancelled, rejected and unknown statuses nowhere', () => {
    const map = buildSeatBreakdowns(
      ['t1'],
      [
        { tierId: 't1', status: 'cancelled', seats: 4 },
        { tierId: 't1', status: 'rejected', seats: 4 },
        { tierId: 't1', status: 'whatever', seats: 4 },
      ],
      [],
    );
    expect(map.get('t1')).toEqual({ confirmed: 0, awaitingReview: 0, held: 0 });
  });

  it('keeps tiers apart and ignores rows for tiers that were not asked for', () => {
    const map = buildSeatBreakdowns(
      ['a', 'b'],
      [
        { tierId: 'a', status: 'pending_payment', seats: 2 },
        { tierId: 'b', status: 'verified', seats: 1 },
        { tierId: 'zzz', status: 'verified', seats: 9 },
        { tierId: null, status: 'verified', seats: 9 },
      ],
      [{ tierId: 'b', count: 1 }],
    );
    expect(map.get('a')).toEqual({ confirmed: 0, awaitingReview: 0, held: 2 });
    expect(map.get('b')).toEqual({ confirmed: 2, awaitingReview: 0, held: 0 });
    expect(map.has('zzz')).toBe(false);
  });
});

describe('querySeatBreakdowns', () => {
  function client(regs: any[], tickets: any[]) {
    return {
      registration: { groupBy: jest.fn().mockResolvedValue(regs) },
      ticket: { groupBy: jest.fn().mockResolvedValue(tickets) },
    };
  }

  it('runs ONE registration groupBy and ONE ticket groupBy however many tiers there are', async () => {
    const c = client(
      [{ tierId: 'a', status: 'pending_payment', _sum: { attendeeCount: 2 } }],
      [{ ticketTierId: 'b', _count: { id: 3 } }],
    );
    const map = await querySeatBreakdowns(c as any, ['a', 'b', 'c', 'd']);
    expect(c.registration.groupBy).toHaveBeenCalledTimes(1);
    expect(c.ticket.groupBy).toHaveBeenCalledTimes(1);
    expect(c.registration.groupBy.mock.calls[0][0]).toMatchObject({
      by: ['tierId', 'status'],
      where: { tierId: { in: ['a', 'b', 'c', 'd'] }, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
    });
    expect(map.get('a')!.held).toBe(2);
    expect(map.get('b')!.confirmed).toBe(3);
    expect(map.get('c')).toEqual({ confirmed: 0, awaitingReview: 0, held: 0 });
  });

  it('runs no query for no tiers', async () => {
    const c = client([], []);
    expect((await querySeatBreakdowns(c as any, [])).size).toBe(0);
    expect(c.registration.groupBy).not.toHaveBeenCalled();
  });

  it('equals the seats today\'s getTierUsage reports (sum of the three buckets)', async () => {
    const regs = [
      { tierId: 'a', status: 'verified', _sum: { attendeeCount: 3 } },
      { tierId: 'a', status: 'proof_submitted', _sum: { attendeeCount: 1 } },
      { tierId: 'a', status: 'pending_payment', _sum: { attendeeCount: 2 } },
    ];
    const today = regs.reduce((n, r) => n + r._sum.attendeeCount, 0) + 2; // + tickets
    const map = await querySeatBreakdowns(client(regs, [{ ticketTierId: 'a', _count: { id: 2 } }]) as any, ['a']);
    expect(reservedSeats(map.get('a')!)).toBe(today);
  });
});
