import { Prisma } from '@prisma/client';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsService running-event bib assignment', () => {
  it('assigns the first distance-scoped bib only inside approval transaction', async () => {
    const registration = {
      id: 'registration-1',
      userId: 'user-1',
      status: 'pending_approval',
      total: new Prisma.Decimal(0),
      referenceNumber: 'AX-0001',
      tierName: '5K',
      unitPrice: new Prisma.Decimal(0),
      subtotal: new Prisma.Decimal(0),
      fees: new Prisma.Decimal(0),
      discount: new Prisma.Decimal(0),
      currency: 'PHP',
      attendeeCount: 1,
      attendeesCompletedAt: new Date(),
      createdAt: new Date(),
      proofs: [],
      attendees: [
        {
          id: 'attendee-1',
          firstName: 'Alex',
          lastName: 'Rivera',
          email: 'alex@example.com',
          isLead: true,
          qrToken: null,
          raceDistance: '5K',
          bibNumber: null,
        },
      ],
      event: {
        id: 'event-1',
        title: 'Axon Run',
        startsAt: new Date('2026-09-01T00:00:00.000Z'),
        venue: 'Davao City',
        city: 'Davao City',
        maxCapacity: null,
        eventType: 'running',
        runningConfig: {
          distances: [{ name: '5K', code: '5K' }],
        },
        organization: { name: 'Axon Organizer' },
      },
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      registration: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentProof: { update: jest.fn() },
      raceBibCounter: {
        upsert: jest.fn().mockResolvedValue({ nextValue: 2 }),
      },
      attendee: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      registration: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(registration)
          .mockResolvedValueOnce({
            ...registration,
            attendees: [
              {
                ...registration.attendees[0],
                qrToken: 'signed-qr-token',
                bibNumber: '5K-0001',
              },
            ],
          }),
      },
      attendee: { update: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const email = { sendQrCodeEmail: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue('test-qr-secret') };
    const funnel = { track: jest.fn().mockResolvedValue(undefined) };
    const service = new RegistrationsService(
      prisma as any,
      email as any,
      audit as any,
      config as any,
      funnel as any,
      {} as any,
    );

    await service.approve('registration-1', 'admin-1');

    expect(tx.registration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'registration-1',
          status: { in: ['proof_submitted', 'pending_approval'] },
        }),
      }),
    );
    expect(tx.raceBibCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId_distance: { eventId: 'event-1', distance: '5K' },
        },
        create: expect.objectContaining({ nextValue: 2 }),
        update: { nextValue: { increment: 1 } },
      }),
    );
    expect(tx.attendee.update).toHaveBeenCalledWith({
      where: { id: 'attendee-1' },
      data: expect.objectContaining({
        bibNumber: '5K-0001',
        bibSequence: 1,
        bibAssignedAt: expect.any(Date),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BIB_ASSIGNED',
        entityId: 'attendee-1',
        metadata: {
          eventId: 'event-1',
          distance: '5K',
          bibNumber: '5K-0001',
        },
      }),
    );
  });
});
