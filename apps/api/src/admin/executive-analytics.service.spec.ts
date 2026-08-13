import { BadRequestException } from '@nestjs/common';
import { ExecutiveAnalyticsService } from './executive-analytics.service';

describe('ExecutiveAnalyticsService', () => {
  const prisma = {
    organization: { findMany: jest.fn() },
    event: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
    registration: { findMany: jest.fn() },
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new ExecutiveAnalyticsService(prisma, audit);

  beforeEach(() => {
    prisma.organization.findMany.mockResolvedValue([
      {
        id: 'org-1',
        events: [
          { status: 'on_sale', startsAt: new Date('2026-09-01'), endsAt: new Date('2026-09-02') },
        ],
      },
    ]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'active',
        status: 'on_sale',
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2026-09-02'),
      },
      {
        id: 'done',
        status: 'completed',
        startsAt: new Date('2026-07-01'),
        endsAt: new Date('2026-07-02'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', birthday: new Date('2000-08-14') },
      { id: 'u2', birthday: null },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'o1',
        userId: 'u1',
        status: 'paid',
        total: 1100,
        fees: 100,
        createdAt: new Date('2026-08-10T00:00:00Z'),
        event: { organization: { id: 'org-1', name: 'Axon Organizer' } },
        tickets: [{ id: 't1' }, { id: 't2' }],
      },
    ]);
    prisma.registration.findMany.mockResolvedValue([
      {
        id: 'r1',
        userId: null,
        guestEmail: 'GUEST@EXAMPLE.COM',
        total: 550,
        fees: 50,
        verifiedAt: new Date('2026-08-11T00:00:00Z'),
        event: { organization: { id: 'org-1', name: 'Axon Organizer' } },
        attendees: [{ id: 'a1' }],
      },
    ]);
  });

  it('calculates reconciled executive metrics from both transaction flows', async () => {
    const result = await service.getSnapshot('2026-08-01T00:00:00Z', '2026-08-13T23:59:59Z', 'day');
    expect(result.contractVersion).toBe('2.1');
    expect(result.metrics).toMatchObject({
      totalOrganizers: 1,
      activeOrganizers: 1,
      overallEvents: 2,
      activeEvents: 1,
      finishedEvents: 1,
      successfulTransactions: 2,
      ticketsIssued: 3,
      grossSales: 1650,
      refunds: 0,
      netSales: 1650,
      platformFees: 150,
      averageOrderValue: 825,
      averageSpendPerPayingUser: 825,
      ageDataCoverage: 0.5,
    });
    expect(result.timeline).toHaveLength(2);
    expect(result.organizerPerformance).toEqual([
      {
        organizerId: 'org-1',
        organizerName: 'Axon Organizer',
        successfulTransactions: 2,
        ticketsIssued: 3,
        grossSales: 1650,
        refunds: 0,
        netSales: 1650,
      },
    ]);
  });

  it('rejects reversed and excessive ranges', async () => {
    await expect(service.getSnapshot('2026-08-14', '2026-08-13')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getSnapshot('2020-01-01', '2026-08-13')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('uses the Asia/Manila calendar date for age and timeline boundaries', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', birthday: new Date('2000-08-14T00:00:00.000Z') },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'o1',
        userId: 'u1',
        status: 'paid',
        total: 100,
        fees: 0,
        createdAt: new Date('2026-08-13T16:30:00.000Z'),
        event: { organization: { id: 'org-1', name: 'Axon Organizer' } },
        tickets: [],
      },
    ]);
    prisma.registration.findMany.mockResolvedValue([]);
    const result = await service.getSnapshot(
      '2026-08-13T00:00:00+08:00',
      '2026-08-14T00:30:00+08:00',
      'day',
    );
    expect(result.metrics.averageCustomerAge).toBe(26);
    expect(result.timeline[0].period).toBe('2026-08-14');
  });

  it('exports the exact calculation snapshot and writes a governance audit', async () => {
    const csv = await service.exportSnapshot(
      'super-admin-1',
      '2026-08-01T00:00:00Z',
      '2026-08-13T23:59:59Z',
      'day',
    );
    expect(csv).toContain('"grossSales","1650"');
    expect(csv).toContain('"Axon Organizer","2","3","1650","0","1650"');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXECUTIVE_ANALYTICS_EXPORTED',
        performedById: 'super-admin-1',
        metadata: expect.objectContaining({ contractVersion: '2.1', result: 'success' }),
      }),
    );
  });

  it('neutralizes spreadsheet formulas in organizer names', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'o1',
        userId: 'u1',
        status: 'paid',
        total: 100,
        fees: 10,
        createdAt: new Date('2026-08-10T00:00:00Z'),
        event: { organization: { id: 'org-risk', name: '=HYPERLINK("https://invalid.example")' } },
        tickets: [],
      },
    ]);
    prisma.registration.findMany.mockResolvedValue([]);
    const csv = await service.exportSnapshot(
      'super-admin-1',
      '2026-08-01T00:00:00Z',
      '2026-08-13T23:59:59Z',
      'day',
    );
    expect(csv).toContain('"\t=HYPERLINK(""https://invalid.example"")"');
  });
});
