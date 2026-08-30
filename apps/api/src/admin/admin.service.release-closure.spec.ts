import { AdminService } from './admin.service';

describe('AdminService Release 2 closure', () => {
  const prisma = {
    attendee: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    raceBibCounter: { upsert: jest.fn() },
    event: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const audit = { log: jest.fn() };
  const eventAccess = { assertEventAccess: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminService(prisma, eventAccess as any, {} as any, {} as any, {} as any, {} as any, audit as any, {} as any);
  const admin = { sub: 'admin-1', isAdmin: true } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
  });

  it('filters and exports the aggregate merchandise summary with an audit record', async () => {
    prisma.attendee.findMany.mockResolvedValue([{ raceDistance: '5K', raceDivision: 'Open', merchandiseSize: 'M', claimedAt: null }]);
    const csv = await service.exportMerchandiseSummary('event-1', admin, { distance: '5K', claimStatus: 'unclaimed' });
    expect(csv).toContain('5K');
    expect(prisma.attendee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ raceDistance: '5K', claimedAt: null }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MERCHANDISE_SUMMARY_EXPORTED', metadata: expect.objectContaining({ result: 'success', rowCount: 1 }) }));
  });

  it('atomically allocates a new bib and records both sides of reassignment', async () => {
    prisma.attendee.findFirst.mockResolvedValue({ id: 'a1', registrationId: 'r1', raceDistance: '5K', bibNumber: '5K-0001', event: { eventType: 'running', runningConfig: { distances: [{ name: '5K', code: '5K' }, { name: '10K', code: '10K' }] } } });
    const tx = { $executeRaw: jest.fn(), raceBibCounter: { upsert: jest.fn().mockResolvedValue({ nextValue: 4 }) }, attendee: { update: jest.fn() } };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    const result = await service.reassignRaceDistance('event-1', 'a1', '10K', 'Approved runner request', admin);
    expect(result.bibNumber).toBe('10K-0003');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BIB_REASSIGNED', metadata: expect.objectContaining({ previousBibNumber: '5K-0001', newBibNumber: '10K-0003' }) }));
  });

  it('denies a non-creator export without revealing event existence and audits the outcome', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    await expect(service.assertEventExportAccess('event-1', { sub: 'organizer-2', isAdmin: false } as any, 'attendee_masterlist'))
      .rejects.toThrow('Event not found');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SENSITIVE_EXPORT_DENIED',
      entityId: 'event-1',
      performedById: 'organizer-2',
      metadata: expect.objectContaining({ scope: 'attendee_masterlist', result: 'denied' }),
    }));
  });
});
