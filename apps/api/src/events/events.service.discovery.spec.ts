import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

const NOW = new Date('2026-07-26T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function approvedRegistrations(prefix: string, attendeeCount = 1) {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `${prefix}-registration-${index}`,
    userId: `${prefix}-user-${index}`,
    guestEmail: null,
    attendeeCount,
    verifiedAt: new Date(NOW.getTime() - index * 60 * 60 * 1000),
  }));
}

function eventFixture(
  id: string,
  startsAt: Date,
  endsAt: Date,
  options: { status?: string; publishedAt?: Date; saleEndsAt?: Date } = {},
) {
  return {
    id,
    slug: id,
    title: `Event ${id}`,
    venue: 'Davao Convention Center',
    city: 'Davao City',
    startsAt,
    endsAt,
    imageUrl: null,
    status: options.status ?? 'on_sale',
    category: 'sports',
    eventType: 'running',
    isOnline: false,
    isFree: false,
    publishedAt: options.publishedAt ?? new Date(NOW.getTime() - 2 * DAY),
    tiers: [
      {
        id: `${id}-tier`,
        price: 500,
        totalQuantity: 100,
        soldQuantity: 0,
        saleEndsAt: options.saleEndsAt ?? new Date(NOW.getTime() + DAY),
      },
    ],
    registrations: approvedRegistrations(id, 2),
    organization: { name: 'Axon Organizer', publicSlug: 'axon-organizer' },
  };
}

describe('EventsService.findDiscovery()', () => {
  const eventFindMany = jest.fn();
  const eventUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
  const registrationGroupBy = jest.fn();
  const ticketGroupBy = jest.fn().mockResolvedValue([]);
  const prisma = {
    event: { findMany: eventFindMany, updateMany: eventUpdateMany },
    registration: { groupBy: registrationGroupBy },
    ticket: { groupBy: ticketGroupBy },
  } as any;
  const service = new EventsService(prisma, {} as any, {} as any);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    eventFindMany.mockReset();
    eventUpdateMany.mockClear();
    registrationGroupBy.mockReset();
    ticketGroupBy.mockClear();
    registrationGroupBy.mockImplementation(({ where }: any) => {
      const tierId = where.tierId.in[0] as string;
      return Promise.resolve([
        { tierId, _sum: { attendeeCount: tierId.startsWith('now') ? 92 : 30 } },
      ]);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps each time section and applies every approved automatic label', async () => {
    eventFindMany.mockResolvedValue([
      eventFixture(
        'missed',
        new Date(NOW.getTime() - 3 * DAY),
        new Date(NOW.getTime() - 2 * DAY),
        { status: 'completed' },
      ),
      eventFixture('now', new Date(NOW.getTime() - 60 * 60 * 1000), new Date(NOW.getTime() + 60 * 60 * 1000)),
      eventFixture('soon', new Date(NOW.getTime() + 10 * DAY), new Date(NOW.getTime() + 11 * DAY)),
      eventFixture('upcoming', new Date(NOW.getTime() + 45 * DAY), new Date(NOW.getTime() + 46 * DAY)),
    ]);

    const result = await service.findDiscovery('sports');
    const happeningNow = result.sections.happeningNow[0];

    expect(happeningNow.id).toBe('now');
    expect(happeningNow.labels).toEqual(
      expect.arrayContaining([
        'New',
        'Sales End Soon',
        'Few Remaining',
        'Selling Fast',
        'Hottest Right Now',
      ]),
    );
    expect(result.sections.happeningSoon.map((event) => event.id)).toEqual(['soon']);
    expect(result.sections.upcomingEvents.map((event) => event.id)).toEqual(['upcoming']);
    expect(result.sections.eventsYouMissed.map((event) => event.id)).toEqual(['missed']);
    expect(result.sections.eventsYouMissed[0].labels).toContain('Event Concluded');
    expect(result.sections.hottestRightNow).toHaveLength(3);
  });

  it('hides Hottest Right Now when fewer than three events qualify', async () => {
    const qualifying = eventFixture(
      'qualifying',
      new Date(NOW.getTime() + DAY),
      new Date(NOW.getTime() + 2 * DAY),
    );
    const belowMinimum = {
      ...eventFixture(
        'below-minimum',
        new Date(NOW.getTime() + 2 * DAY),
        new Date(NOW.getTime() + 3 * DAY),
      ),
      registrations: approvedRegistrations('below-minimum').slice(0, 9),
    };
    eventFindMany.mockResolvedValue([qualifying, belowMinimum]);

    const result = await service.findDiscovery();

    expect(result.sections.hottestRightNow).toEqual([]);
    expect(result.sections.happeningSoon.find((event) => event.id === 'below-minimum')?.labels)
      .not.toContain('Hottest Right Now');
  });

  it('moves a future event with closed registration into Events You Missed', async () => {
    eventFindMany.mockResolvedValue([
      eventFixture('closed-future', new Date(NOW.getTime() + 10 * DAY), new Date(NOW.getTime() + 11 * DAY), {
        saleEndsAt: new Date(NOW.getTime() - 1),
      }),
    ]);

    const result = await service.findDiscovery();

    expect(result.sections.happeningSoon).toEqual([]);
    expect(result.sections.eventsYouMissed.map((event) => event.id)).toEqual(['closed-future']);
    expect(result.sections.eventsYouMissed[0].labels).toContain('Registration Closed');
  });

  it('rejects unsupported category filters before querying the database', async () => {
    await expect(service.findDiscovery('unsupported')).rejects.toThrow(BadRequestException);
    expect(eventFindMany).not.toHaveBeenCalled();
  });
});
