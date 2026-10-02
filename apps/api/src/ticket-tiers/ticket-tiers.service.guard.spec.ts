import { ConflictException } from '@nestjs/common';
import { TicketTiersService } from './ticket-tiers.service';

/** Breakdown rows the fake database returns: 5 sold (3 verified + 2 tickets), 2 awaiting, 5 pending. */
function makeService(tierTotal = 20) {
  const order: string[] = [];
  const tx = {
    $queryRaw: jest.fn().mockImplementation(async () => {
      order.push('lock');
      return [{ id: 'tier_1' }];
    }),
    registration: {
      groupBy: jest.fn().mockImplementation(async () => {
        order.push('count');
        return [
          { tierId: 'tier_1', status: 'verified', _sum: { attendeeCount: 3 } },
          { tierId: 'tier_1', status: 'proof_submitted', _sum: { attendeeCount: 2 } },
          { tierId: 'tier_1', status: 'pending_payment', _sum: { attendeeCount: 5 } },
        ];
      }),
    },
    ticket: { groupBy: jest.fn().mockResolvedValue([{ ticketTierId: 'tier_1', _count: { id: 2 } }]) },
    ticketTier: {
      update: jest.fn().mockImplementation(async () => {
        order.push('update');
        return { id: 'tier_1' };
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'tier_1', inclusions: [] }),
      delete: jest.fn().mockImplementation(async () => {
        order.push('delete');
      }),
    },
    ticketTierInclusion: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    ticketTier: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tier_1', soldQuantity: 999, totalQuantity: tierTotal, inclusions: [] }),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const events = { seedTierInventory: jest.fn().mockResolvedValue(undefined), findById: jest.fn() };
  return { service: new TicketTiersService(prisma as any, events as any), tx, order, events };
}

describe('capacity guard (PUT /admin/tiers/:id)', () => {
  it('rejects a capacity below the live reserved seats with a 409 and the canonical message', async () => {
    const { service, tx } = makeService();
    const err = await service.update('tier_1', { totalQuantity: 11 }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe(
      "You can't go below 12: 5 sold, 2 awaiting review, 5 pending payment. Wait for pending checkouts to expire, or release them in Transactions.",
    );
    expect(tx.ticketTier.update).not.toHaveBeenCalled();
  });

  it('accepts a capacity exactly equal to the reserved seats', async () => {
    const { service, tx } = makeService();
    await service.update('tier_1', { totalQuantity: 12 });
    expect(tx.ticketTier.update).toHaveBeenCalled();
  });

  it('takes the tier row lock BEFORE counting, and counts BEFORE updating', async () => {
    const { service, order } = makeService();
    await service.update('tier_1', { totalQuantity: 30 });
    expect(order).toEqual(['lock', 'count', 'update']);
  });

  it('does not apply the guard when capacity is not being changed (legacy over-capacity tiers stay editable)', async () => {
    const { service, tx } = makeService(5); // already below the 12 reserved
    await service.update('tier_1', { name: 'Renamed' });
    await service.update('tier_1', { totalQuantity: 5 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.ticketTier.update).toHaveBeenCalledTimes(2);
  });

  it('reseeds Redis from the live count measured under the lock, not the stored column', async () => {
    const { service, events } = makeService();
    await service.update('tier_1', { totalQuantity: 30 });
    expect(events.seedTierInventory).toHaveBeenCalledWith('tier_1', 18); // 30 - 12, not 30 - 999
  });
});

describe('delete (DELETE /admin/tiers/:id)', () => {
  it('refuses with a 409 using the live breakdown while any seat is reserved', async () => {
    const { service, tx } = makeService();
    const err = await service.delete('tier_1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain('5 sold, 2 awaiting review, 5 pending payment');
    expect(tx.ticketTier.delete).not.toHaveBeenCalled();
  });

  it('deletes an unreserved tier, checking under the lock first', async () => {
    const { service, tx, order } = makeService();
    tx.registration.groupBy.mockResolvedValue([]);
    tx.ticket.groupBy.mockResolvedValue([]);
    await expect(service.delete('tier_1')).resolves.toEqual({ deleted: true });
    expect(order[0]).toBe('lock');
    expect(order[order.length - 1]).toBe('delete');
  });
});
