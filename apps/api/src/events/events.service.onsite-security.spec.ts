import { EventsService } from './events.service';

const redis = {} as any;
const workspaces = { ensureWorkspace: jest.fn() } as any;

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-onsite-security',
    slug: 'onsite-security-event',
    title: 'On-site Security Event',
    status: 'on_sale',
    onsiteRegistrationEnabled: true,
    isFree: true,
    platformFee: 0,
    agenda: null,
    tiers: [{ id: 'tier-general', name: 'General', totalQuantity: 10, price: 0, currency: 'PHP' }],
    ...overrides,
  };
}

function validDto(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-onsite-security',
    tierId: 'tier-general',
    firstName: 'Walkin',
    lastName: 'Attendee',
    email: 'walkin@example.com',
    contactNumber: '+639171234567',
    gender: 'prefer_not_to_say',
    birthday: '1995-05-20',
    city: 'Davao City',
    ...overrides,
  } as any;
}

describe('EventsService on-site privacy, integrity, and concurrency controls', () => {
  it.each([
    [{ onsiteRegistrationEnabled: false }, 'On-site registration is not enabled for this event.'],
    [{ status: 'draft' }, 'Registration is not open yet. This event is currently draft.'],
  ])('rejects before a transaction when event state is invalid', async (overrides, message) => {
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event(overrides)) },
      $transaction: jest.fn(),
    } as any;
    const service = new EventsService(prisma, redis, workspaces);
    await expect(service.handleOnsiteRegistrationScan('slug', validDto())).rejects.toThrow(message);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns no saved PII from the unauthenticated name-only suggestion endpoint', async () => {
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'event-onsite-security', status: 'on_sale', onsiteRegistrationEnabled: true }) },
      attendee: { findFirst: jest.fn() },
    } as any;
    const service = new EventsService(prisma, redis, workspaces);
    await expect(service.findOnsiteProfileSuggestion('slug', {
      eventId: 'event-onsite-security', firstName: 'Known', lastName: 'Customer',
    })).resolves.toEqual({ match: null });
    expect(prisma.attendee.findFirst).not.toHaveBeenCalled();
  });

  it('takes an attendee identity lock before checking duplicates', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const findFirst = jest.fn().mockResolvedValue({
      id: 'attendee-pending',
      registration: { id: 'registration-pending', referenceNumber: 'AXN-PENDING', tierName: 'General', status: 'pending_approval' },
    });
    const tx = { $executeRaw: executeRaw, attendee: { findFirst } };
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event()) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const service = new EventsService(prisma, redis, workspaces);

    await expect(service.handleOnsiteRegistrationScan('slug', validDto({ email: 'WALKIN@EXAMPLE.COM' })))
      .rejects.toThrow('This attendee already has a registration with status pending_approval. Please ask staff for assistance.');
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[0]);
  });

  it('rejects exhausted inventory before account, registration, or attendee writes', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      attendee: { findFirst: jest.fn().mockResolvedValue(null) },
      registration: { aggregate: jest.fn().mockResolvedValue({ _sum: { attendeeCount: 10 } }), create: jest.fn() },
      ticket: { count: jest.fn().mockResolvedValue(0) },
      user: { upsert: jest.fn() },
    };
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event()) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const service = new EventsService(prisma, redis, workspaces);

    await expect(service.handleOnsiteRegistrationScan('slug', validDto()))
      .rejects.toThrow('No seats are available for this ticket tier.');
    expect(tx.user.upsert).not.toHaveBeenCalled();
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it('stores supplied email as event data only while atomically issuing QR, inventory, and attendance', async () => {
    const attendee = {
      id: 'attendee-email', registrationId: 'registration-email', firstName: 'Walkin', lastName: 'Attendee', email: 'walkin@example.com',
    };
    const attendance = {
      id: 'attendance-email', checkInDate: new Date('2026-08-11T00:00:00.000Z'), checkedInAt: new Date('2026-08-11T01:00:00.000Z'),
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      attendee: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ ...attendee, qrToken: 'signed-token' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      attendeeAttendance: { create: jest.fn().mockResolvedValue(attendance) },
      user: { upsert: jest.fn() },
      registration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { attendeeCount: 2 } }),
        create: jest.fn().mockResolvedValue({
          id: attendee.registrationId, referenceNumber: 'AXN-WALKIN', tierName: 'General', attendees: [attendee],
        }),
      },
      ticket: { count: jest.fn().mockResolvedValue(1) },
      ticketTier: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event({ isFree: false, platformFee: 50, tiers: [{ id: 'tier-general', name: 'General', totalQuantity: 10, price: 500, currency: 'PHP' }] })) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const service = new EventsService(prisma, redis, workspaces, { get: jest.fn((key: string) => key === 'qr.hmacSecret' ? 'test-secret' : undefined) } as any);

    const result = await service.handleOnsiteRegistrationScan('slug', validDto({ email: 'WALKIN@EXAMPLE.COM' }));
    expect(tx.user.upsert).not.toHaveBeenCalled();
    expect(tx.registration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        attendeeCount: 1,
        subtotal: 500,
        fees: 50,
        total: 550,
        status: 'verified',
        paymentMethod: 'onsite_qr',
        attendees: { create: expect.objectContaining({ email: 'walkin@example.com' }) },
      }),
    }));
    expect(tx.ticketTier.update).toHaveBeenCalledWith({ where: { id: 'tier-general' }, data: { soldQuantity: 4 } });
    expect(tx.attendee.update).toHaveBeenCalledWith(expect.objectContaining({ data: { qrToken: expect.any(String) } }));
    expect(result.created).toBe(true);
    expect(result.registration.referenceNumber).toBe('AXN-WALKIN');
  });
});
