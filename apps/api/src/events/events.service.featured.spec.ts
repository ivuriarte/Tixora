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
