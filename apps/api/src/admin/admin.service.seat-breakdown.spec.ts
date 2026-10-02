import { AdminService } from './admin.service';

function makeService() {
  const baseEvent = {
    slug: 's', title: 'T', description: '', imageUrl: null, venue: 'V', city: 'C',
    startsAt: new Date('2027-02-05T10:00:00.000Z'), endsAt: null, status: 'on_sale', isFree: false,
    onsiteRegistrationEnabled: false, isFeatured: false, featuredOrder: null, featuredUntil: null,
    tagline: null, organization: null, maxCapacity: null, _count: { tickets: 0, orders: 0 },
  };
  const tier = (id: string, total: number) => ({ id, name: id, price: 500, totalQuantity: total, soldQuantity: 0 });
  const events = [
    { ...baseEvent, id: 'e1', tiers: [tier('t1', 25), tier('t2', 21)] },
    { ...baseEvent, id: 'e2', tiers: [tier('t3', 10)] },
  ];
  const prisma = {
    event: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue(events), findFirst: jest.fn() },
    registration: {
      groupBy: jest.fn().mockResolvedValue([
        { tierId: 't1', status: 'verified', _sum: { attendeeCount: 3 } },
        { tierId: 't1', status: 'proof_submitted', _sum: { attendeeCount: 2 } },
        { tierId: 't1', status: 'pending_payment', _sum: { attendeeCount: 2 } },
        { tierId: 't3', status: 'pending_payment', _sum: { attendeeCount: 7 } },
      ]),
    },
    ticket: { groupBy: jest.fn().mockResolvedValue([{ ticketTierId: 't2', _count: { id: 1 } }]) },
  };
  const eventsService = {
    autoCompleteExpiredEvents: jest.fn().mockResolvedValue(undefined),
    withLiveInventory: jest.fn(),
  };
  const service = new AdminService(
    prisma as any, { eventOwnerWhere: jest.fn().mockReturnValue({}) } as any, eventsService as any,
    {} as any, {} as any, { get: jest.fn() } as any, { log: jest.fn() } as any, {} as any,
  );
  return { service, prisma, eventsService };
}

describe('admin Events list: Sold / Awaiting review / Pending payment', () => {
  it('adds the three event-level counts and keeps ticketsSold as the reserved total', async () => {
    const { service } = makeService();
    const { data } = await service.listEvents({ isAdmin: true } as any, 1, 100);
    const [e1, e2] = data as any[];
    expect(e1).toMatchObject({ ticketsConfirmed: 4, ticketsAwaitingReview: 2, ticketsHeld: 2, ticketsSold: 8 });
    expect(e1.ticketsSold).toBe(e1.ticketsConfirmed + e1.ticketsAwaitingReview + e1.ticketsHeld);
    // The screenshot case: nothing paid, seven pending checkouts.
    expect(e2).toMatchObject({ ticketsConfirmed: 0, ticketsAwaitingReview: 0, ticketsHeld: 7, ticketsSold: 7 });
  });

  it('adds the split to each tier and keeps availability = capacity - reserved', async () => {
    const { service } = makeService();
    const { data } = await service.listEvents({ isAdmin: true } as any, 1, 100);
    const t1 = (data as any[])[0].tiers[0];
    expect(t1).toMatchObject({
      totalQuantity: 25, soldQuantity: 7, availableQuantity: 18,
      confirmedQuantity: 3, awaitingReviewQuantity: 2, heldQuantity: 2,
    });
  });

  it('uses ONE registration groupBy and ONE ticket groupBy for the whole page (no per-event queries)', async () => {
    const { service, prisma, eventsService } = makeService();
    await service.listEvents({ isAdmin: true } as any, 1, 100);
    expect(prisma.registration.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.groupBy).toHaveBeenCalledTimes(1);
    expect(eventsService.withLiveInventory).not.toHaveBeenCalled();
  });
});
