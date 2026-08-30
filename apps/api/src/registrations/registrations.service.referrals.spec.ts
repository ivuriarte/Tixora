import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RegistrationsService } from './registrations.service';

function makeService(usageCount = 0) {
  const prisma = { referralCodeUsage: { count: jest.fn().mockResolvedValue(usageCount) } };
  const service = new RegistrationsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, prisma };
}

function referral(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ref_1', code: 'SAVE10', isActive: true, validFrom: null, validUntil: null,
    maxUses: null, applicableTierIds: Prisma.JsonNull, discountType: 'percentage',
    discountValue: new Prisma.Decimal(10), ...overrides,
  };
}

describe('RegistrationsService referral pricing', () => {
  it('applies percentage discount to the full bulk-registration subtotal', async () => {
    const { service } = makeService();
    await expect((service as any).evaluateReferral((service as any).prisma, referral(), 'tier_1', 150_000))
      .resolves.toEqual({ discount: 15_000 });
  });

  it('applies fixed centavo discount once and never reduces below zero', async () => {
    const { service } = makeService();
    const fixed = referral({ discountType: 'fixed_amount', discountValue: new Prisma.Decimal(90_000) });
    await expect((service as any).evaluateReferral((service as any).prisma, fixed, 'tier_1', 50_000))
      .resolves.toEqual({ discount: 50_000 });
  });

  it.each([
    ['inactive', referral({ isActive: false })],
    ['not active yet', referral({ validFrom: new Date(Date.now() + 60_000) })],
    ['expired', referral({ validUntil: new Date(Date.now() - 60_000) })],
  ])('rejects %s codes', async (_label, code) => {
    const { service } = makeService();
    await expect((service as any).evaluateReferral((service as any).prisma, code, 'tier_1', 50_000))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code at its usage limit', async () => {
    const { service } = makeService(5);
    await expect((service as any).evaluateReferral((service as any).prisma, referral({ maxUses: 5 }), 'tier_1', 50_000))
      .rejects.toThrow('usage limit');
  });

  it('rejects a code for a non-applicable tier', async () => {
    const { service } = makeService();
    await expect((service as any).evaluateReferral((service as any).prisma, referral({ applicableTierIds: ['tier_2'] }), 'tier_1', 50_000))
      .rejects.toThrow('does not apply');
  });

  it('rejects future and implausibly old birthdays', () => {
    const { service } = makeService();
    expect(() => (service as any).validateAttendeeDemographics([{ birthday: '2999-01-01', city: 'Davao' }])).toThrow(BadRequestException);
    expect(() => (service as any).validateAttendeeDemographics([{ birthday: '1800-01-01', city: 'Davao' }])).toThrow(BadRequestException);
  });

  it('allows attendees without optional demographic fields', () => {
    const { service } = makeService();
    expect(() => (service as any).validateAttendeeDemographics([{}])).not.toThrow();
  });

  it('classifies age using the event date and returns an immutable snapshot', () => {
    const { service } = makeService();
    const event = {
      eventType: 'running',
      startsAt: new Date('2026-09-14T23:00:00.000Z'),
      runningConfig: {
        ageGroups: [
          { name: 'Junior', minAge: 12, maxAge: 17 },
          { name: 'Open', minAge: 18, maxAge: 39 },
        ],
      },
    };

    expect((service as any).runningAgeGroupSnapshot(event, { birthday: '2008-09-16' }))
      .toEqual({ age: 17, name: 'Junior' });
    expect((service as any).runningAgeGroupSnapshot(event, { birthday: '2008-09-15' }))
      .toEqual({ age: 18, name: 'Open' });
  });

  it('rejects a runner whose event-day age is outside configured groups', () => {
    const { service } = makeService();
    const event = {
      eventType: 'running',
      startsAt: new Date('2026-09-14T23:00:00.000Z'),
      runningConfig: { ageGroups: [{ name: 'Adult', minAge: 18, maxAge: 99 }] },
    };

    expect(() => (service as any).runningAgeGroupSnapshot(event, { birthday: '2012-01-01' }))
      .toThrow('not covered by a configured age group');
  });
});
