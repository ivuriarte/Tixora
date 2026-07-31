import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

function makePaidEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-paid',
    title: 'Paid event',
    status: 'draft',
    eventType: 'standard',
    runningConfig: null,
    imageUrl: 'https://cdn.example.com/event.jpg',
    isFree: false,
    allowManualPayment: false,
    paymentMethods: null,
    bankName: null,
    bankAccountNumber: null,
    gcashNumber: null,
    isFeatured: false,
    ...overrides,
  };
}

describe('EventsService paid event publishing', () => {
  it.each(['published', 'on_sale'] as const)(
    'blocks %s without a configured manual payment method',
    async (status) => {
      const prisma = {
        event: {
          findUnique: jest.fn().mockResolvedValue(makePaidEvent()),
          update: jest.fn(),
        },
      };
      const service = new EventsService(prisma as any, {} as any, {} as any);
      jest.spyOn(service, 'findById').mockResolvedValue(makePaidEvent() as any);

      await expect(service.update('event-paid', { status } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.event.update).not.toHaveBeenCalled();
    },
  );

  it('allows a paid event to go on sale after a complete method is configured', async () => {
    const prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue(makePaidEvent()),
        update: jest.fn().mockResolvedValue({ id: 'event-paid', status: 'on_sale' }),
      },
    };
    const service = new EventsService(prisma as any, {} as any, {} as any);
    jest.spyOn(service, 'findById').mockResolvedValue(makePaidEvent() as any);

    await expect(
      service.update('event-paid', {
        status: 'on_sale',
        allowManualPayment: true,
        paymentMethods: [
          { name: 'GCash', type: 'gcash', accountNumber: '09171234567' },
        ],
      } as any),
    ).resolves.toEqual({ id: 'event-paid', status: 'on_sale' });
  });

  it('does not impose the paid-method rule on free events', async () => {
    const prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue(makePaidEvent({ isFree: true })),
        update: jest.fn().mockResolvedValue({ id: 'event-free', status: 'on_sale' }),
      },
    };
    const service = new EventsService(prisma as any, {} as any, {} as any);
    jest
      .spyOn(service, 'findById')
      .mockResolvedValue(makePaidEvent({ isFree: true }) as any);

    await expect(
      service.update('event-free', { status: 'on_sale' } as any),
    ).resolves.toEqual({ id: 'event-free', status: 'on_sale' });
  });
});
