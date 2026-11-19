/**
 * U-59 – U-68: EventsService.findFeatured() unit tests
 *
 * Covers:
 *  U-59  returns empty array when no featured events exist
 *  U-60  returns only events with isFeatured = true
 *  U-61  excludes events where featuredUntil is in the past
 *  U-62  includes events where featuredUntil is null (no expiry)
 *  U-63  includes events where featuredUntil is in the future
 *  U-64  excludes events with status 'draft' or 'cancelled'
 *  U-65  includes events with status 'on_sale'
 *  U-66  includes events with status 'sold_out'
 *  U-67  orders by featuredOrder ASC (nulls last), then startsAt ASC
 *  U-68  maps lowestPrice and totalAvailable from tiers correctly
 *
 * Also covers the 3-slot cap in EventsService.update(): only events the homepage would
 * show (flagged, on_sale or sold_out, featuredUntil null or in the future) hold a slot.
 */

import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

// ── minimal stub for PrismaService ─────────────────────────────────────────

const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockEventCount = jest.fn();
const mockEventUpdate = jest.fn();
const mockRegistrationGroupBy = jest.fn();
const mockTicketGroupBy = jest.fn();
const mockPrisma = {
  event: {
    findMany: mockFindMany,
    findUnique: mockFindUnique,
    count: mockEventCount,
    update: mockEventUpdate,
  },
  registration: { groupBy: mockRegistrationGroupBy },
  ticket: { groupBy: mockTicketGroupBy },
} as any;

const mockRedis = {} as any;

// ── helpers ────────────────────────────────────────────────────────────────

function makeDbEvent(overrides: {
  id?: string;
  slug?: string;
  title?: string;
  isFeatured?: boolean;
  status?: string;
  featuredUntil?: Date | null;
  featuredOrder?: number | null;
  featuredImageUrl?: string | null;
  startsAt?: Date;
  tagline?: string | null;
  tiers?: Array<{ id?: string; price: number | { toNumber: () => number }; soldQuantity: number; totalQuantity: number }>;
} = {}) {
  const tiers = overrides.tiers ?? [{ id: 'tier_1', price: 50000, soldQuantity: 0, totalQuantity: 100 }];
  return {
    id: overrides.id ?? 'evt_1',
    slug: overrides.slug ?? 'test-event',
    title: overrides.title ?? 'Test Event',
    description: 'A test event',
    speakerName: 'Speaker Name',
    tagline: overrides.tagline ?? null,
    featuredImageUrl: overrides.featuredImageUrl ?? null,
    venue: 'Manila',
    city: 'Davao',
    startsAt: overrides.startsAt ?? new Date('2026-09-01T02:00:00Z'),
    endsAt: null,
    imageUrl: '/featured/test.jpg',
    status: overrides.status ?? 'on_sale',
    maxCapacity: 100,
    isFree: false,
    isFeatured: overrides.isFeatured ?? true,
    featuredOrder: overrides.featuredOrder ?? null,
    featuredUntil: overrides.featuredUntil ?? null,
    tiers,
  };
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('EventsService.findFeatured()', () => {
  let service: EventsService;

  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindUnique.mockReset();
    mockEventCount.mockReset();
    mockEventUpdate.mockReset();
    mockRegistrationGroupBy.mockReset();
    mockTicketGroupBy.mockReset();
    mockRegistrationGroupBy.mockResolvedValue([]);
    mockTicketGroupBy.mockResolvedValue([]);
    service = new EventsService(mockPrisma, mockRedis, { ensureWorkspace: jest.fn() } as any);
  });

  // U-59
  it('returns empty array when Prisma returns no rows', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await service.findFeatured();
    expect(result).toEqual([]);
  });

  // U-60
  it('only queries events with isFeatured: true', async () => {
    mockFindMany.mockResolvedValue([]);
    await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    expect(queryArgs.where.isFeatured).toBe(true);
  });

  // U-61
  it('excludes events where featuredUntil is in the past', async () => {
    mockFindMany.mockResolvedValue([]);
    await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    const orClause = queryArgs.where.OR as Array<unknown>;
    expect(orClause).toHaveLength(2);
    const futureBranch = orClause[1] as { featuredUntil: { gt: Date } };
    expect(futureBranch.featuredUntil.gt).toBeInstanceOf(Date);
  });

  // U-62
  it('includes events where featuredUntil is null', async () => {
    mockFindMany.mockResolvedValue([]);
    await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    const orClause = queryArgs.where.OR as Array<unknown>;
    expect(orClause[0]).toEqual({ featuredUntil: null });
  });

  // U-63
  it('returns event whose featuredUntil is in the future', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const evt = makeDbEvent({ featuredUntil: future });
    mockFindMany.mockResolvedValue([evt]);
    const result = await service.findFeatured();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('test-event');
  });

  // U-64
  it('excludes draft and cancelled events via status filter', async () => {
    mockFindMany.mockResolvedValue([]);
    await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    const statusIn = (queryArgs.where.status as { in: string[] }).in;
    expect(statusIn).toContain('on_sale');
    expect(statusIn).not.toContain('draft');
    expect(statusIn).not.toContain('cancelled');
  });

  // U-65
  it('includes on_sale events in the status filter', async () => {
    mockFindMany.mockResolvedValue([]);
    await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    expect((queryArgs.where.status as { in: string[] }).in).toContain('on_sale');
  });

  // U-66
  it('includes sold_out events in the status filter', async () => {
    mockFindMany.mockResolvedValue([]);
    await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    expect((queryArgs.where.status as { in: string[] }).in).toContain('sold_out');
  });

  // U-67
  it('orders by featuredOrder ASC nulls-last, then startsAt ASC', async () => {
    const evt1 = makeDbEvent({ id: 'a', featuredOrder: 2, startsAt: new Date('2026-09-01T00:00:00Z') });
    const evt2 = makeDbEvent({ id: 'b', featuredOrder: 1, startsAt: new Date('2026-09-02T00:00:00Z') });
    mockFindMany.mockResolvedValue([evt2, evt1]);
    const result = await service.findFeatured();
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('a');
    const [queryArgs] = mockFindMany.mock.calls[0];
    const [firstOrder] = queryArgs.orderBy as Array<{ featuredOrder?: unknown }>;
    expect(firstOrder).toHaveProperty('featuredOrder');
  });

  // U-68
  it('maps lowestPrice and totalAvailable from live tier usage', async () => {
    const evt = makeDbEvent({
      id: 'evt_1',
      tiers: [
        { id: 'tier_1', price: 500, soldQuantity: 10, totalQuantity: 50 },
        { id: 'tier_2', price: 300, soldQuantity: 5, totalQuantity: 30 },
      ],
    });
    mockRegistrationGroupBy.mockResolvedValue([
      { tierId: 'tier_1', _sum: { attendeeCount: 11 } },
      { tierId: 'tier_2', _sum: { attendeeCount: 6 } },
    ]);
    mockFindMany.mockResolvedValue([evt]);
    const result = await service.findFeatured();
    expect(result[0].lowestPrice).toBe(500);
    expect(result[0].totalAvailable).toBe(63);
  });

  it('limits the homepage contract to three slides and returns the dedicated artwork', async () => {
    mockFindMany.mockResolvedValue([
      makeDbEvent({ featuredImageUrl: 'https://res.cloudinary.com/demo/featured.webp' }),
    ]);
    const result = await service.findFeatured();
    const [queryArgs] = mockFindMany.mock.calls[0];
    expect(queryArgs.take).toBe(3);
    expect(result[0]).toEqual(expect.objectContaining({
      featuredImageUrl: 'https://res.cloudinary.com/demo/featured.webp',
      primaryTierId: 'tier_1',
    }));
  });

  it('rejects a fourth active featured event', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'event-4',
      imageUrl: 'https://res.cloudinary.com/demo/cover.webp',
      isFeatured: false,
    });
    mockEventCount.mockResolvedValue(3);

    await expect(service.update('event-4', { isFeatured: true })).rejects.toThrow(BadRequestException);
    expect(mockEventUpdate).not.toHaveBeenCalled();
  });
});

// ── featured slot cap ──────────────────────────────────────────────────────

type FeaturedRow = {
  id: string;
  isFeatured: boolean;
  status: string;
  featuredUntil: Date | null;
};

/**
 * Stands in for prisma.event.count() over an in-memory table. It understands only the
 * operators the featured-cap filter uses and throws on anything else, so a filter change
 * the fake cannot evaluate fails loudly instead of silently counting everything.
 */
function countWhere(rows: FeaturedRow[], where: Record<string, any>): number {
  const keysOf = (value: unknown): string => Object.keys(value as object).sort().join(',');
  const unsupported = (what: string, value: unknown): never => {
    throw new Error(`countWhere fake cannot evaluate ${what}: ${JSON.stringify(value)}`);
  };
  const matches = (row: FeaturedRow): boolean =>
    Object.entries(where).every(([key, cond]) => {
      switch (key) {
        case 'id':
          if (keysOf(cond) !== 'not') return unsupported('id condition', cond);
          return row.id !== cond.not;
        case 'isFeatured':
          if (typeof cond !== 'boolean') return unsupported('isFeatured condition', cond);
          return row.isFeatured === cond;
        case 'status':
          if (keysOf(cond) !== 'in') return unsupported('status condition', cond);
          return (cond.in as string[]).includes(row.status);
        case 'OR':
          return (cond as Array<Record<string, any>>).some((branch) => {
            if (keysOf(branch) !== 'featuredUntil') return unsupported('OR branch', branch);
            const until = branch.featuredUntil;
            if (until === null) return row.featuredUntil === null;
            if (keysOf(until) !== 'gt' || !(until.gt instanceof Date)) {
              return unsupported('featuredUntil condition', until);
            }
            return row.featuredUntil !== null && row.featuredUntil > until.gt;
          });
        default:
          return unsupported('filter key', key);
      }
    });
  return rows.filter(matches).length;
}

function maskDates(value: unknown): unknown {
  if (value instanceof Date) return '<date>';
  if (Array.isArray(value)) return value.map(maskDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDates(v)]));
  }
  return value;
}

describe('EventsService.update() featured slot cap', () => {
  let service: EventsService;
  let table: FeaturedRow[];

  const future = () => new Date(Date.now() + 7 * 86_400_000);
  const past = () => new Date(Date.now() - 7 * 86_400_000);
  const row = (id: string, status: string, featuredUntil: Date | null = null): FeaturedRow => ({
    id,
    isFeatured: true,
    status,
    featuredUntil,
  });
  const unflagged = (id: string, status: string): FeaturedRow => ({
    ...row(id, status),
    isFeatured: false,
  });

  beforeEach(() => {
    table = [];
    mockFindUnique.mockReset();
    mockEventCount.mockReset();
    mockEventUpdate.mockReset();
    // The event being featured: currently not featured, so the cap check applies.
    mockFindUnique.mockResolvedValue({
      id: 'event-new',
      imageUrl: 'https://res.cloudinary.com/demo/cover.webp',
      isFeatured: false,
    });
    mockEventCount.mockImplementation(({ where }) => Promise.resolve(countWhere(table, where)));
    mockEventUpdate.mockImplementation(({ data }) => Promise.resolve({ id: 'event-new', ...data }));
    service = new EventsService(mockPrisma, mockRedis, { ensureWorkspace: jest.fn() } as any);
  });

  it('allows featuring when completed events still carry the flag', async () => {
    // The 2026-11-18 UAT state: three completed events flagged, nothing visible on the homepage.
    table = [
      row('old-1', 'completed'),
      row('old-2', 'completed'),
      row('old-3', 'completed'),
      unflagged('plain-1', 'on_sale'),
    ];

    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();
    expect(mockEventUpdate).toHaveBeenCalledWith({
      where: { id: 'event-new' },
      data: expect.objectContaining({ isFeatured: true }),
    });
  });

  it('allows featuring when cancelled events still carry the flag', async () => {
    table = [row('old-1', 'cancelled'), row('old-2', 'cancelled'), row('old-3', 'cancelled')];

    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();
    expect(mockEventUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not count on-sale events that were never flagged as featured', async () => {
    table = [
      unflagged('plain-1', 'on_sale'),
      unflagged('plain-2', 'on_sale'),
      unflagged('plain-3', 'sold_out'),
    ];

    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();
  });

  it('does not count draft events, which the homepage does not show either', async () => {
    table = [row('d-1', 'draft'), row('d-2', 'draft'), row('d-3', 'draft')];

    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();
  });

  it('does not count events whose featuredUntil date has passed', async () => {
    table = [
      row('exp-1', 'on_sale', past()),
      row('exp-2', 'on_sale', past()),
      row('exp-3', 'sold_out', past()),
    ];

    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();
  });

  it('still blocks a fourth when three visible featured events exist', async () => {
    table = [
      row('live-1', 'on_sale'),
      row('live-2', 'sold_out'),
      row('live-3', 'on_sale', future()),
    ];

    await expect(service.update('event-new', { isFeatured: true })).rejects.toThrow(
      'The homepage supports up to 3 featured events. Disable one before adding another.',
    );
    expect(mockEventUpdate).not.toHaveBeenCalled();
  });

  it('counts only the visible ones when stale completed events sit beside them', async () => {
    table = [
      row('live-1', 'on_sale'),
      row('live-2', 'on_sale'),
      row('old-1', 'completed'),
      row('old-2', 'cancelled'),
      row('old-3', 'completed'),
    ];

    // Two visible + three stale: one free slot, so the third visible event is allowed...
    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();

    // ...and with that third one in place, a fourth is refused.
    table.push(row('event-new', 'on_sale'));
    mockFindUnique.mockResolvedValue({
      id: 'event-fourth',
      imageUrl: 'https://res.cloudinary.com/demo/cover.webp',
      isFeatured: false,
    });
    mockEventUpdate.mockClear();
    await expect(service.update('event-fourth', { isFeatured: true })).rejects.toThrow(
      BadRequestException,
    );
    expect(mockEventUpdate).not.toHaveBeenCalled();
  });

  it('excludes the event being edited from the count', async () => {
    // Two other visible events, plus the edited event's own row already flagged (for
    // example a concurrent save): it must not count against itself.
    table = [row('live-1', 'on_sale'), row('live-2', 'on_sale'), row('event-new', 'on_sale')];

    await expect(service.update('event-new', { isFeatured: true })).resolves.toBeDefined();
    const [countArgs] = mockEventCount.mock.calls[0];
    expect(countArgs.where.id).toEqual({ not: 'event-new' });
  });

  it('does not run the cap check when the event is already featured or is being unfeatured', async () => {
    table = [
      row('live-1', 'on_sale'),
      row('live-2', 'on_sale'),
      row('live-3', 'on_sale'),
    ];

    mockFindUnique.mockResolvedValue({
      id: 'event-new',
      imageUrl: 'https://res.cloudinary.com/demo/cover.webp',
      isFeatured: true,
    });
    await service.update('event-new', { isFeatured: true });
    await service.update('event-new', { isFeatured: false });

    expect(mockEventCount).not.toHaveBeenCalled();
    expect(mockEventUpdate).toHaveBeenCalledTimes(2);
  });

  it('uses the same visibility filter as the homepage carousel query', async () => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockRegistrationGroupBy.mockResolvedValue([]);
    mockTicketGroupBy.mockResolvedValue([]);

    await service.update('event-new', { isFeatured: true });
    await service.findFeatured();

    const [capArgs] = mockEventCount.mock.calls[0];
    const [carouselArgs] = mockFindMany.mock.calls[0];
    const capFilter = { ...capArgs.where };
    delete capFilter.id; // the cap also leaves out the event being edited
    // The two filters read the clock at different moments, so compare them with dates masked.
    expect(maskDates(capFilter)).toEqual(maskDates(carouselArgs.where));
    expect(capFilter.OR[1].featuredUntil.gt).toBeInstanceOf(Date);
  });
});

describe('EventsService.update() featured settings', () => {
  let service: EventsService;

  beforeEach(() => {
    mockFindUnique.mockReset();
    mockEventUpdate.mockReset();
    mockFindUnique.mockResolvedValue({ id: 'evt_1', imageUrl: '/featured/test.jpg' });
    mockEventUpdate.mockImplementation(({ data }) => Promise.resolve({ id: 'evt_1', ...data }));
    service = new EventsService(mockPrisma, mockRedis, { ensureWorkspace: jest.fn() } as any);
  });

  it('atomically clears ordering and expiry when featuring is disabled', async () => {
    await service.update('evt_1', {
      isFeatured: false,
      featuredOrder: 3,
      featuredUntil: '2026-12-31T15:59:59.000Z',
    });

    expect(mockEventUpdate).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      data: expect.objectContaining({
        isFeatured: false,
        featuredOrder: null,
        featuredUntil: null,
      }),
    });
  });
});
