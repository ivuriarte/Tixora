import { TicketTiersService } from './ticket-tiers.service';

describe('TicketTiersService — inclusions', () => {
  function makeService() {
    const eventsService = {
      findById: jest.fn().mockResolvedValue({ id: 'evt_1' }),
      seedTierInventory: jest.fn().mockResolvedValue(undefined),
    };

    const tx = {
      ticketTier: {
        update: jest.fn().mockResolvedValue({ id: 'tier_1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'tier_1', inclusions: [] }),
      },
      ticketTierInclusion: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const prisma = {
      ticketTier: {
        create: jest.fn().mockResolvedValue({ id: 'tier_1', totalQuantity: 100, inclusions: [] }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'tier_1',
          soldQuantity: 0,
          totalQuantity: 100,
          inclusions: [],
        }),
      },
      $transaction: jest.fn().mockImplementation((fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const service = new TicketTiersService(prisma as any, eventsService as any);
    return { service, prisma, tx, eventsService };
  }

  it('creates normalized inclusion rows with a new tier', async () => {
    const { service, prisma } = makeService();

    await service.create('evt_1', {
      name: 'VIP',
      price: 0,
      totalQuantity: 100,
      inclusions: [
        { label: ' Meal stub ', stubEnabled: true },
        { label: 'meal stub', stubEnabled: true },
        { label: 'Coffee stub', stubEnabled: false, sortOrder: 9 },
      ],
    });

    expect(prisma.ticketTier.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inclusions: {
          create: [
            { label: 'Meal stub', stubEnabled: true, sortOrder: 0 },
            { label: 'Coffee stub', stubEnabled: false, sortOrder: 9 },
          ],
        },
      }),
      include: { inclusions: { orderBy: { sortOrder: 'asc' } } },
    }));
  });

  it('atomically replaces inclusions during tier update', async () => {
    const { service, tx } = makeService();

    await service.update('tier_1', {
      inclusions: [
        { label: 'Certificate', stubEnabled: true },
        { label: 'Coffee stub', stubEnabled: true },
      ],
    });

    expect(tx.ticketTierInclusion.deleteMany).toHaveBeenCalledWith({ where: { tierId: 'tier_1' } });
    expect(tx.ticketTierInclusion.createMany).toHaveBeenCalledWith({
      data: [
        { tierId: 'tier_1', label: 'Certificate', stubEnabled: true, sortOrder: 0 },
        { tierId: 'tier_1', label: 'Coffee stub', stubEnabled: true, sortOrder: 1 },
      ],
    });
  });

  it('deletes existing inclusions when update receives an empty inclusion list', async () => {
    const { service, tx } = makeService();

    await service.update('tier_1', { inclusions: [] });

    expect(tx.ticketTierInclusion.deleteMany).toHaveBeenCalledWith({ where: { tierId: 'tier_1' } });
    expect(tx.ticketTierInclusion.createMany).not.toHaveBeenCalled();
  });
});
