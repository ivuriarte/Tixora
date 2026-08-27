import { Prisma } from '@prisma/client';
import { OptionalInclusionsService } from './optional-inclusions.service';

function makeService(
  options: { isFree?: boolean; referral?: boolean; platformFee?: number } = {},
) {
  const event = {
    id: 'event-1',
    status: 'on_sale',
    isFree: options.isFree ?? false,
    platformFee: new Prisma.Decimal(options.platformFee ?? 50),
    maxPerUser: 4,
    tiers: [
      {
        id: 'tier-1',
        name: 'General Admission',
        price: new Prisma.Decimal(1000),
        currency: 'PHP',
        maxPerOrder: 4,
      },
    ],
  };
  const inclusion = {
    id: 'inclusion-1',
    name: 'Event Shirt',
    status: 'active',
    saleStartsAt: null,
    saleEndsAt: null,
    fulfillmentMethod: 'pickup',
    fulfillmentInstructions: 'Claim at the merchandise desk.',
    eligibleTiers: [{ ticketTierId: 'tier-1', maxQuantityPerRegistration: 3 }],
  };
  const variant = {
    id: 'variant-1',
    name: 'Medium',
    price: new Prisma.Decimal(500),
    totalStock: 20,
    reservedStock: 2,
    soldStock: 3,
    isActive: true,
    inclusion,
  };
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const prisma = {
    event: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ optionalInclusionsEnabled: true })
        .mockResolvedValueOnce(event),
    },
    inclusionVariant: { findMany: jest.fn().mockResolvedValue([variant]) },
    referralCode: {
      findFirst: jest.fn().mockResolvedValue(
        options.referral
          ? {
              id: 'referral-1',
              code: 'SAVE10',
              isActive: true,
              validFrom: null,
              validUntil: null,
              maxUses: null,
              applicableTierIds: [],
              discountType: 'percentage',
              discountValue: new Prisma.Decimal(10),
              deletedAt: null,
            }
          : null,
      ),
    },
    referralCodeUsage: { count: jest.fn().mockResolvedValue(0) },
    checkoutQuote: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'quote-1',
          token: 'quote-token',
          expiresAt,
          ...data,
        }),
      ),
    },
  };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          'optionalInclusions.enabled': true,
          'optionalInclusions.quoteTtlMinutes': 15,
          'optionalInclusions.defaultPlatformFee': 50,
        })[key],
    ),
  };
  return {
    service: new OptionalInclusionsService(prisma as never, config as never, {} as never),
    prisma,
  };
}

describe('OptionalInclusionsService authoritative quote', () => {
  it('charges the event fee when free admission has a paid add-on', async () => {
    const { service } = makeService({ isFree: true });

    const quote = await service.createQuote('event-1', {
      tierId: 'tier-1',
      attendeeCount: 1,
      selections: [
        { inclusionId: 'inclusion-1', variantId: 'variant-1', quantity: 1, attendeeIndex: 0 },
      ],
    });

    expect(quote.admissionSubtotal).toBe(0);
    expect(quote.inclusionSubtotal).toBe(500);
    expect(quote.fees).toBe(50);
    expect(quote.total).toBe(550);
  });

  it('uses the configured add-on fee only for free admission when the event fee is zero', async () => {
    const { service: freeEventService } = makeService({ isFree: true, platformFee: 0 });
    const { service: paidEventService } = makeService({ isFree: false, platformFee: 0 });
    const request = {
      tierId: 'tier-1',
      attendeeCount: 1,
      selections: [
        { inclusionId: 'inclusion-1', variantId: 'variant-1', quantity: 1, attendeeIndex: 0 },
      ],
    };

    const freeEventQuote = await freeEventService.createQuote('event-1', request);
    const paidEventQuote = await paidEventService.createQuote('event-1', request);

    expect(freeEventQuote.fees).toBe(50);
    expect(freeEventQuote.total).toBe(550);
    expect(paidEventQuote.fees).toBe(0);
    expect(paidEventQuote.total).toBe(1500);
  });

  it('captures fulfillment instructions in the immutable quote snapshot', async () => {
    const { service, prisma } = makeService();

    const quote = await service.createQuote('event-1', {
      tierId: 'tier-1',
      attendeeCount: 1,
      selections: [
        { inclusionId: 'inclusion-1', variantId: 'variant-1', quantity: 1, attendeeIndex: 0 },
      ],
    });

    expect(quote.lineItems).toContainEqual(
      expect.objectContaining({
        kind: 'inclusion',
        fulfillmentInstructions: 'Claim at the merchandise desk.',
      }),
    );
    expect(prisma.checkoutQuote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pricingSnapshot: expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({
                kind: 'inclusion',
                fulfillmentInstructions: 'Claim at the merchandise desk.',
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('applies referral discounts to admission only, never to add-ons', async () => {
    const { service } = makeService({ referral: true });

    const quote = await service.createQuote('event-1', {
      tierId: 'tier-1',
      attendeeCount: 1,
      referralCode: 'save10',
      selections: [
        { inclusionId: 'inclusion-1', variantId: 'variant-1', quantity: 1, attendeeIndex: 0 },
      ],
    });

    expect(quote.admissionSubtotal).toBe(1000);
    expect(quote.inclusionSubtotal).toBe(500);
    expect(quote.discount).toBe(100);
    expect(quote.total).toBe(1450);
  });

  it('rejects a combined attendee allocation above the per-registration maximum', async () => {
    const { service } = makeService();

    await expect(
      service.createQuote('event-1', {
        tierId: 'tier-1',
        attendeeCount: 2,
        selections: [
          { inclusionId: 'inclusion-1', variantId: 'variant-1', quantity: 2, attendeeIndex: 0 },
          { inclusionId: 'inclusion-1', variantId: 'variant-1', quantity: 2, attendeeIndex: 1 },
        ],
      }),
    ).rejects.toThrow('Maximum 3 unit(s) of Event Shirt per registration');
  });
});

describe('OptionalInclusionsService organizer configuration', () => {
  it('updates the event switch and its audit record in one transaction', async () => {
    const updated = { id: 'event-1', optionalInclusionsEnabled: true };
    const tx = { event: { update: jest.fn().mockResolvedValue(updated) } };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const audit = { logWith: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string) => key === 'optionalInclusions.enabled'),
    };
    const service = new OptionalInclusionsService(
      prisma as never,
      config as never,
      audit as never,
    );

    await expect(service.setEventEnabled('event-1', true, 'organizer-1')).resolves.toEqual(
      updated,
    );
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { optionalInclusionsEnabled: true },
      select: { id: true, optionalInclusionsEnabled: true },
    });
    expect(audit.logWith).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'OPTIONAL_INCLUSIONS_ENABLED',
        entityId: 'event-1',
        performedById: 'organizer-1',
      }),
    );
  });

  it('persists tier eligibility and its per-registration limit together', async () => {
    const created = { id: 'inclusion-1', variants: [], eligibleTiers: [] };
    const tx = {
      eventInclusion: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = {
      ticketTier: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const audit = { logWith: jest.fn().mockResolvedValue(undefined) };
    const service = new OptionalInclusionsService(prisma as never, {} as never, audit as never);

    await service.create(
      'event-1',
      {
        name: 'Event Shirt',
        tierEligibility: [{ tierId: 'tier-1', maxQuantityPerRegistration: 3 }],
      },
      'organizer-1',
    );

    expect(tx.eventInclusion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eligibleTiers: {
            create: [{ ticketTierId: 'tier-1', maxQuantityPerRegistration: 3 }],
          },
        }),
      }),
    );
  });

  it('rejects duplicate tier eligibility before writing the catalog item', async () => {
    const service = new OptionalInclusionsService({} as never, {} as never, {} as never);

    await expect(
      service.create(
        'event-1',
        {
          name: 'Event Shirt',
          tierEligibility: [
            { tierId: 'tier-1', maxQuantityPerRegistration: 2 },
            { tierId: 'tier-1', maxQuantityPerRegistration: 3 },
          ],
        },
        'organizer-1',
      ),
    ).rejects.toThrow('Each eligible ticket tier may only be configured once');
  });

  it('prevents deactivating the last viable variant of an active inclusion', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'inclusion-1' }])
        .mockResolvedValueOnce([{ id: 'variant-1' }]),
      eventInclusion: {
        findUnique: jest.fn().mockResolvedValue({ status: 'active' }),
      },
      inclusionVariant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'variant-1' }),
        update: jest.fn().mockResolvedValue({ id: 'variant-1', isActive: false }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new OptionalInclusionsService(prisma as never, {} as never, {} as never);

    await expect(
      service.updateVariant(
        'event-1',
        'inclusion-1',
        'variant-1',
        { isActive: false },
        'organizer-1',
      ),
    ).rejects.toThrow('An active inclusion requires at least one active variant with stock');
  });
});

describe('OptionalInclusionsService checkout and fulfillment safeguards', () => {
  it('rechecks the event switch inside the quote-consumption transaction', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'event-1', optionalInclusionsEnabled: false },
      ]),
      checkoutQuote: { findUnique: jest.fn() },
    };
    const config = {
      get: jest.fn((key: string) => key === 'optionalInclusions.enabled'),
    };
    const service = new OptionalInclusionsService({} as never, config as never, {} as never);

    await expect(
      service.consumeQuoteTx(
        tx as never,
        'quote-token',
        'user-1',
        'registration-1',
        'event-1',
        'tier-1',
        ['attendee-1'],
      ),
    ).rejects.toThrow('Optional inclusions are not enabled for this event');
    expect(tx.checkoutQuote.findUnique).not.toHaveBeenCalled();
  });

  it('allows a reversed line to be fulfilled again and clears reversal state', async () => {
    const line = {
      id: 'line-1',
      registrationId: 'registration-1',
      sourceId: 'variant-1',
      quantity: 1,
      fulfillments: [{ id: 'fulfillment-1', status: 'reversed' }],
    };
    const updated = { id: 'fulfillment-1', status: 'fulfilled' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'fulfillment-1' }]),
      registrationLineItem: { findFirst: jest.fn().mockResolvedValue(line) },
      inclusionFulfillment: { update: jest.fn().mockResolvedValue(updated) },
      inclusionInventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const audit = { logWith: jest.fn().mockResolvedValue(undefined) };
    const service = new OptionalInclusionsService(prisma as never, {} as never, audit as never);

    await expect(
      service.fulfill('event-1', 'line-1', { quantity: 1 }, 'organizer-1'),
    ).resolves.toEqual(updated);
    expect(tx.inclusionFulfillment.update).toHaveBeenCalledWith({
      where: { id: 'fulfillment-1' },
      data: expect.objectContaining({
        status: 'fulfilled',
        reversedById: null,
        reversedAt: null,
        reversalReason: null,
      }),
    });
    expect(tx.inclusionInventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        variantId: 'variant-1',
        type: 'fulfill',
        quantity: 1,
      }),
    });
  });
});
