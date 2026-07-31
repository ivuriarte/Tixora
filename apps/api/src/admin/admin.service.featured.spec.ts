import { AdminService } from './admin.service';

describe('AdminService featured event settings', () => {
  const featuredUntil = new Date('2026-09-30T15:59:59.000Z');

  function makeService() {
    const prisma = {
      event: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'evt_featured',
            slug: 'featured-event',
            title: 'Featured Event',
            description: 'Featured description',
            imageUrl: '/featured.jpg',
            venue: 'Davao Convention Center',
            city: 'Davao City',
            startsAt: new Date('2026-09-01T10:00:00.000Z'),
            status: 'on_sale',
            isFree: false,
            onsiteRegistrationEnabled: false,
            isFeatured: true,
            featuredOrder: 2,
            featuredUntil,
            tagline: 'ONE NIGHT ONLY',
            organization: null,
            maxCapacity: 500,
            _count: { tickets: 0, orders: 0 },
            tiers: [],
          },
        ]),
      },
    };
    const eventsService = {
      autoCompleteExpiredEvents: jest.fn().mockResolvedValue(undefined),
      withLiveInventory: jest.fn().mockResolvedValue([]),
    };
    const eventAccess = {
      eventOwnerWhere: jest.fn().mockReturnValue({}),
    };
    const service = new AdminService(
      prisma as any,
      eventAccess as any,
      eventsService as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    return { prisma, service };
  }

  it('returns persisted featured settings in the admin event list', async () => {
    const { service } = makeService();

    const result = await service.listEvents({ isAdmin: true } as any, 1, 100);

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'evt_featured',
        isFeatured: true,
        featuredOrder: 2,
        featuredUntil: featuredUntil.toISOString(),
        tagline: 'ONE NIGHT ONLY',
      }),
    ]);
  });
});
