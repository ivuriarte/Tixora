import { Prisma } from '@prisma/client';
import { RegistrationsService } from './registrations.service';

const NOW = new Date('2026-10-02T10:00:00.000Z');
const attendee = {
  firstName: 'Ana', lastName: 'Reyes', email: 'ana@example.com', phone: '09171234567',
  birthday: '1995-06-15', gender: 'female', city: 'Davao City', company: '', jobTitle: '',
};
const dto = { eventId: 'evt_1', tierId: 'tier_1', attendees: [attendee] };

function makeService(opts: { price?: number; isFree?: boolean; minutes?: number; expiredHolds?: string[] } = {}) {
  const { price = 500, isFree = false, minutes, expiredHolds = [] } = opts;
  const created = {
    id: 'reg_1', referenceNumber: 'AX-1', status: 'pending_payment', total: new Prisma.Decimal(price),
    fees: new Prisma.Decimal(0), subtotal: new Prisma.Decimal(price), discount: new Prisma.Decimal(0),
    unitPrice: new Prisma.Decimal(price), attendeeCount: 1, currency: 'PHP', notes: null, rejectionReason: null,
    referralCodeSnapshot: null, eventId: 'evt_1', tierId: 'tier_1', tierName: 'General',
    createdAt: new Date(), updatedAt: new Date(),
    attendees: [{ id: 'a1', isLead: true, email: null, firstName: 'Ana', qrToken: null }],
    event: { title: 'E', paymentMethods: [] },
  };
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ sold_quantity: 0, total_quantity: 100 }]),
    registration: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...created, lineItems: [] }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { attendeeCount: 0 } }),
    },
    registrationLineItem: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ticket: { count: jest.fn().mockResolvedValue(0) },
    ticketTier: { update: jest.fn() },
    referralCode: { findFirst: jest.fn().mockResolvedValue(null) },
    referralCodeUsage: { create: jest.fn() },
    user: { update: jest.fn() },
  };
  const prisma = {
    event: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'evt_1', status: 'published', isFree, allowManualPayment: true, platformFee: new Prisma.Decimal(0),
        maxPerUser: 0, agenda: null,
        tiers: [{ id: 'tier_1', name: 'General', price: new Prisma.Decimal(price), maxPerOrder: 10, currency: 'PHP' }],
      }),
    },
    registration: { findMany: jest.fn().mockResolvedValue(expiredHolds.map((id) => ({ id }))) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const config = { get: jest.fn((key: string) => (key === 'memberHold.minutes' ? minutes : 'https://x.test')) };
  const holds = { releasePendingHold: jest.fn().mockResolvedValue({ released: true }) };
  const service = new RegistrationsService(
    prisma as never, { sendRegistrationConfirmation: jest.fn(), sendFreeRegistrationConfirmation: jest.fn() } as never,
    { log: jest.fn() } as never, config as never, { track: jest.fn() } as never, {} as never,
    undefined, undefined, holds as never,
  );
  return { service, tx, prisma, holds };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

const deadlineOf = (tx: ReturnType<typeof makeService>['tx']) =>
  tx.registration.create.mock.calls[0][0].data.holdExpiresAt as Date | null;

describe('logged-in unpaid hold deadline', () => {
  it('gives a paid logged-in registration a 60-minute server-set deadline by default', async () => {
    const { service, tx } = makeService();
    await (service as any).createImpl(dto, 'user_1', '1.2.3.4');
    expect(deadlineOf(tx)).toEqual(new Date(NOW.getTime() + 60 * 60_000));
  });

  it('honours MEMBER_HOLD_MINUTES', async () => {
    const { service, tx } = makeService({ minutes: 90 });
    await (service as any).createImpl(dto, 'user_1');
    expect(deadlineOf(tx)).toEqual(new Date(NOW.getTime() + 90 * 60_000));
  });

  it('gives no deadline to a free event (created pending_approval)', async () => {
    const { service, tx } = makeService({ price: 0, isFree: true });
    await (service as any).createImpl(dto, 'user_1');
    expect(deadlineOf(tx)).toBeNull();
  });

  it('gives no deadline when an add-on selection is present', async () => {
    const { service, tx } = makeService();
    await expect(
      (service as any).createImpl({ ...dto, inclusionSelections: [{ productId: 'p' }] }, 'user_1'),
    ).rejects.toBeDefined(); // add-ons need a quote; the point is no deadline was ever attached
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it('createGuest (pay-later with email, no user) still gets NO deadline', async () => {
    const { service, tx } = makeService();
    await (service as any).createImpl(dto, null, '1.2.3.4', 'ana@example.com', 'hash');
    expect(deadlineOf(tx)).toBeNull();
  });

  it('a deadline supplied by the caller (guest intent) is never overridden', async () => {
    const { service, tx } = makeService();
    const supplied = new Date(NOW.getTime() + 5 * 60_000);
    await (service as any).createImpl(dto, null, '1.2.3.4', undefined, 'hash', true, supplied);
    expect(deadlineOf(tx)).toEqual(supplied);
  });
});

describe('expired-but-not-yet-cleaned logged-in hold', () => {
  it('is released through the shared helper (deadline re-checked under the lock) before the duplicate check', async () => {
    const { service, holds, prisma, tx } = makeService({ expiredHolds: ['old_reg'] });
    await (service as any).createImpl(dto, 'user_1');
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', eventId: 'evt_1', status: 'pending_payment', holdExpiresAt: { lt: NOW } },
      }),
    );
    expect(holds.releasePendingHold).toHaveBeenCalledWith(
      'old_reg',
      expect.objectContaining({ onlyIfExpired: expect.objectContaining({ now: NOW }), inclusionMovement: 'expire' }),
    );
    expect(tx.registration.create).toHaveBeenCalled();
  });

  it('does not look for expired holds for guests', async () => {
    const { service, prisma } = makeService();
    await (service as any).createImpl(dto, null, '1.2.3.4', undefined, 'hash', true, new Date(NOW.getTime() + 1000));
    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /registrations/:id exposes the hold deadline to its owner', () => {
  const row = (status: string, holdExpiresAt: Date | null) => ({
    id: 'reg_1', eventId: 'evt_1', referenceNumber: 'AX-1', status, tierName: 'G', unitPrice: 500,
    attendeeCount: 1, subtotal: 500, fees: 0, total: 500, discount: 0, referralCodeSnapshot: null,
    currency: 'PHP', notes: null, rejectionReason: null, holdExpiresAt, createdAt: NOW, updatedAt: NOW,
    event: { title: 'E', slug: 'e', startsAt: NOW, endsAt: null, venue: 'V', address: 'A', imageUrl: null,
      bankName: null, bankAccountNumber: null, bankAccountName: null, gcashNumber: null, paymentMethods: null, landmark: null },
    attendees: [], proofs: [], lineItems: [], inclusionReservations: [],
  });

  async function find(status: string, deadline: Date | null) {
    const { service, prisma } = makeService();
    (prisma.registration as any).findFirst = jest.fn().mockResolvedValue(row(status, deadline));
    return service.findById('reg_1', 'user_1') as Promise<{ holdExpiresAt: string | null }>;
  }

  it('returns an ISO deadline for an unpaid hold', async () => {
    const d = new Date(NOW.getTime() + 60 * 60_000);
    expect((await find('pending_payment', d)).holdExpiresAt).toBe(d.toISOString());
  });

  it('returns null when there is no deadline (older registration)', async () => {
    expect((await find('pending_payment', null)).holdExpiresAt).toBeNull();
  });

  it('returns null once the registration is no longer an unpaid hold', async () => {
    expect((await find('verified', new Date(NOW.getTime() + 1000))).holdExpiresAt).toBeNull();
  });
});
