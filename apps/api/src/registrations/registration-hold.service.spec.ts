import { RegistrationHoldService } from './registration-hold.service';

type Row = { status: string; userId: string | null; tierId: string | null; attendeeCount: number } | null;

function makeService(opts: { row?: Row; proofs?: number; soldQuantity?: number | null } = {}) {
  const row: Row =
    opts.row === undefined
      ? { status: 'pending_payment', userId: null, tierId: 'tier-1', attendeeCount: 2 }
      : opts.row;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    registration: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentProof: { count: jest.fn().mockResolvedValue(opts.proofs ?? 0) },
    ticketTier: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.soldQuantity === null ? null : { soldQuantity: opts.soldQuantity ?? 5 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = { $transaction: jest.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)) };
  const audit = { logWith: jest.fn().mockResolvedValue(undefined) };
  const guestHold = { releaseSlot: jest.fn().mockResolvedValue(undefined) };
  const inclusions = { releaseRegistrationReservationsTx: jest.fn().mockResolvedValue(undefined) };
  const service = new RegistrationHoldService(
    prisma as never,
    audit as never,
    guestHold as never,
    inclusions as never,
  );
  return { service, tx, audit, guestHold, inclusions };
}

const options = {
  reason: 'Guest checkout hold expired',
  auditAction: 'REGISTRATION_AUTO_CANCELLED' as const,
  inclusionMovement: 'expire' as const,
};

describe('RegistrationHoldService.releasePendingHold', () => {
  it('cancels an unpaid hold, clears the unverified email, returns the seats and writes the audit row', async () => {
    const { service, tx, audit, guestHold, inclusions } = makeService();

    await expect(service.releasePendingHold('reg-1', options)).resolves.toEqual({ released: true });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2); // registration row, then ticket tier
    expect(inclusions.releaseRegistrationReservationsTx).toHaveBeenCalledWith(
      tx,
      'reg-1',
      'Guest checkout hold expired',
      'expire',
      undefined,
    );
    expect(tx.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { status: 'cancelled', guestResumeEmail: null },
    });
    expect(tx.ticketTier.update).toHaveBeenCalledWith({
      where: { id: 'tier-1' },
      data: { soldQuantity: 3 }, // 5 sold minus this registration's 2 seats
    });
    expect(audit.logWith).toHaveBeenCalledWith(tx, {
      action: 'REGISTRATION_AUTO_CANCELLED',
      entityType: 'Registration',
      entityId: 'reg-1',
      registrationId: 'reg-1',
      performedById: undefined,
      metadata: { reason: 'Guest checkout hold expired' },
    });
    expect(guestHold.releaseSlot).toHaveBeenCalledWith('reg-1');
  });

  it('never lets sold seats go below zero', async () => {
    const { service, tx } = makeService({ soldQuantity: 1 });
    await service.releasePendingHold('reg-1', options);
    expect(tx.ticketTier.update).toHaveBeenCalledWith({ where: { id: 'tier-1' }, data: { soldQuantity: 0 } });
  });

  it('records who released it and any extra audit metadata for people-driven paths', async () => {
    const { service, audit, inclusions } = makeService();
    await service.releasePendingHold('reg-1', {
      reason: 'Hold released by organizer',
      auditAction: 'REGISTRATION_HOLD_RELEASED',
      actorUserId: 'admin-1',
      metadata: { by: 'admin', note: 'duplicate booking' },
    });
    expect(audit.logWith).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'REGISTRATION_HOLD_RELEASED',
        performedById: 'admin-1',
        metadata: { reason: 'Hold released by organizer', by: 'admin', note: 'duplicate booking' },
      }),
    );
    expect(inclusions.releaseRegistrationReservationsTx).toHaveBeenCalledWith(
      expect.anything(),
      'reg-1',
      'Hold released by organizer',
      'release',
      'admin-1',
    );
  });

  it.each(['proof_submitted', 'pending_approval', 'verified', 'cancelled', 'rejected'])(
    'does nothing when the registration is already %s (it lost a race to a proof upload or another release)',
    async (status) => {
      const { service, tx, audit, guestHold } = makeService({
        row: { status, userId: null, tierId: 'tier-1', attendeeCount: 1 },
      });

      await expect(service.releasePendingHold('reg-1', options)).resolves.toEqual({
        released: false,
        why: 'not_pending',
      });
      expect(tx.registration.update).not.toHaveBeenCalled();
      expect(tx.ticketTier.update).not.toHaveBeenCalled();
      expect(audit.logWith).not.toHaveBeenCalled();
      expect(guestHold.releaseSlot).not.toHaveBeenCalled();
    },
  );

  it('refuses to cancel a registration that already has a payment proof', async () => {
    const { service, tx, inclusions } = makeService({ proofs: 1 });
    await expect(service.releasePendingHold('reg-1', options)).resolves.toEqual({
      released: false,
      why: 'has_proof',
    });
    expect(tx.registration.update).not.toHaveBeenCalled();
    expect(inclusions.releaseRegistrationReservationsTx).not.toHaveBeenCalled();
  });

  it('reports a missing registration', async () => {
    const { service, tx } = makeService({ row: null });
    await expect(service.releasePendingHold('missing', options)).resolves.toEqual({
      released: false,
      why: 'not_found',
    });
    expect(tx.registration.update).not.toHaveBeenCalled();
  });

  it('lets the guest-facing cancel touch only guest checkouts, never a logged-in customer', async () => {
    const { service, tx } = makeService({
      row: { status: 'pending_payment', userId: 'user-1', tierId: 'tier-1', attendeeCount: 1 },
    });
    await expect(service.releasePendingHold('reg-1', { ...options, guestOnly: true })).resolves.toEqual({
      released: false,
      why: 'not_guest',
    });
    expect(tx.registration.update).not.toHaveBeenCalled();
  });

  it('skips the tier update when the registration has no tier', async () => {
    const { service, tx } = makeService({
      row: { status: 'pending_payment', userId: null, tierId: null, attendeeCount: 1 },
    });
    await expect(service.releasePendingHold('reg-1', options)).resolves.toEqual({ released: true });
    expect(tx.ticketTier.update).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('works when add-on support is not installed', async () => {
    const tx = makeService().tx;
    const service = new RegistrationHoldService(
      { $transaction: jest.fn(async (cb: (c: typeof tx) => unknown) => cb(tx)) } as never,
      { logWith: jest.fn() } as never,
      { releaseSlot: jest.fn() } as never,
    );
    await expect(service.releasePendingHold('reg-1', options)).resolves.toEqual({ released: true });
  });
});
