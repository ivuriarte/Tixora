import type { Registration } from '@axon-tickets/types';
import { RegistrationsService } from './registrations.service';

/**
 * Incident (Nov 2026): GET /registrations/:id left out `tierId`, although the
 * shared `Registration` type promises it and the payment page reads it. The payment page therefore
 * linked a logged-in buyer to ".../register?...&tierId=" (empty), the register page found no tier
 * and sent the buyer back to the event page BEFORE the attendee-details step. The order stayed paid
 * but unapprovable.
 *
 * These tests pin the part of the response that the checkout hand-off depends on.
 *
 * Note: the compile-time check resolves `@axon-tickets/types` from `packages/types/dist` (see
 * apps/api/tsconfig.json), so rebuild that package if a local run disagrees with CI.
 */
const NOW = new Date('2026-01-01T00:00:00.000Z');

const row = {
  id: 'reg_1',
  eventId: 'evt_1',
  referenceNumber: 'AXN-2026-TEST1',
  status: 'proof_submitted',
  tierId: 'tier_test',
  tierName: 'General Admission',
  unitPrice: 700,
  attendeeCount: 1,
  subtotal: 700,
  fees: 0,
  total: 700,
  discount: 0,
  referralCodeSnapshot: null,
  currency: 'PHP',
  notes: null,
  rejectionReason: null,
  holdExpiresAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  event: {
    title: 'E', slug: 'e', startsAt: NOW, endsAt: null, venue: 'V', address: 'A', imageUrl: null,
    bankName: null, bankAccountNumber: null, bankAccountName: null, gcashNumber: null,
    paymentMethods: null, landmark: null,
  },
  attendees: [],
  proofs: [],
  lineItems: [],
  inclusionReservations: [],
};

function makeService(found: typeof row | null) {
  const prisma = {
    registration: {
      // First call is the expired-hold probe, second is the page read.
      findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(found),
    },
  };
  const holds = { releasePendingHold: jest.fn() };
  const service = new RegistrationsService(
    prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    undefined, undefined, holds as never,
  );
  return { service, prisma };
}

describe('GET /registrations/:id keeps the checkout hand-off fields', () => {
  it('returns the order tier id so the payment page can link to the attendee-details step', async () => {
    const { service } = makeService(row);
    const out = await service.findById('reg_1', 'user_1');
    expect(out.tierId).toBe('tier_test');
  });

  it('returns every scalar field the shared Registration type promises', async () => {
    const { service } = makeService(row);
    const out = await service.findById('reg_1', 'user_1');
    // Compile-time contract: if the service forgets a field the shared type promises (as it did
    // with tierId), or returns one with the wrong type, this assignment fails the type check
    // (ts-jest), not just a runtime assertion. The nested objects are excluded on purpose: the
    // event's payment methods come from a JSON column that Prisma types more loosely.
    type Scalars = Omit<Registration, 'event' | 'attendees' | 'proofs' | 'lineItems'>;
    const scalars: Scalars = out;
    expect(scalars.tierId).toBe('tier_test');
    expect(scalars.tierName).toBe('General Admission');
    expect(scalars.attendeeCount).toBe(1);
  });

  it('never returns a missing tier id as undefined (the web would print "undefined" or an empty value)', async () => {
    const { service } = makeService({ ...row, tierId: null as never });
    const out = await service.findById('reg_1', 'user_1');
    expect('tierId' in out).toBe(true);
    expect(out.tierId).toBeNull();
  });
});
