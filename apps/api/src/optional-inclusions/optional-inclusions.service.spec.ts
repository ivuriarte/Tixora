import { Prisma } from '@prisma/client';
import { OptionalInclusionsService } from './optional-inclusions.service';

function makeService(options: { isFree?: boolean; referral?: boolean } = {}) {
  const event = {
    id: 'event-1',
    status: 'on_sale',
    isFree: options.isFree ?? false,
    platformFee: new Prisma.Decimal(50),
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
});
