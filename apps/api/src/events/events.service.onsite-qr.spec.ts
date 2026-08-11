import { EventsService } from './events.service';

const mockFindUnique = jest.fn();

const mockPrisma = {
  event: { findUnique: mockFindUnique },
} as any;

const mockRedis = {} as any;
const mockWorkspaces = { ensureWorkspace: jest.fn() } as any;

function makeEvent() {
  return {
    id: 'evt_sample',
    slug: 'this-is-my-sample-event-t7ofb',
    title: 'This is my Sample Event',
    description: 'Sample Event',
    venue: 'SM Lanang',
    address: null,
    city: 'Davao City',
    startsAt: new Date('2026-07-15T05:00:00.000Z'),
    endsAt: null,
    imageUrl: null,
    status: 'on_sale',
    maxPerUser: 1,
    maxCapacity: 100,
    speakerName: null,
    sponsors: null,
    agenda: null,
    faqs: null,
    customSections: null,
    allowManualPayment: false,
    onsiteRegistrationEnabled: true,
    bankName: null,
    bankAccountNumber: null,
    bankAccountName: null,
    gcashNumber: null,
    paymentMethods: null,
    isFree: true,
    platformFee: 0,
    landmark: null,
    latitude: null,
    longitude: null,
    tiers: [],
    organization: { id: 'org_1', name: 'Test Event Inc.' },
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

describe('EventsService onsite QR event identity', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it('loads event details by QR eventId when the URL slug is stale or misleading', async () => {
    mockFindUnique.mockResolvedValue(makeEvent());
    const service = new EventsService(mockPrisma, mockRedis, mockWorkspaces);

    const result = await service.findBySlug('off-the-record-bar-talks', 'evt_sample');

    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'evt_sample' },
    }));
    expect(result.id).toBe('evt_sample');
    expect(result.slug).toBe('this-is-my-sample-event-t7ofb');
    expect(result.title).toBe('This is my Sample Event');
  });
});

describe('EventsService onsite QR duplicate registration handling', () => {
  it('returns a specific message when the same attendee details are submitted twice for the same event', async () => {
    const event = {
      ...makeEvent(),
      id: 'evt_duplicate',
      agenda: null,
      tiers: [{ id: 'tier_1', name: 'Visitor', totalQuantity: 100, price: 0, currency: 'PHP' }],
    };
    const existingAttendee = {
      id: 'attendee_1',
      registrationId: 'registration_1',
      firstName: 'Ian Vince',
      lastName: 'Uriarte',
      email: 'ian@example.com',
      registration: {
        id: 'registration_1',
        referenceNumber: 'AXN-2026-ABCDE',
        tierName: 'Visitor',
        status: 'verified',
      },
    };
    const tx = {
      attendee: { findFirst: jest.fn().mockResolvedValue(existingAttendee) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const service = new EventsService(prisma, mockRedis, mockWorkspaces);

    await expect(
      service.handleOnsiteRegistrationScan('msme-week-2026', {
        eventId: event.id,
        tierId: 'tier_1',
        firstName: 'Ian Vince',
        lastName: 'Uriarte',
        email: 'ian@example.com',
        contactNumber: '09254626315',
        gender: 'male',
        birthday: '1990-01-01',
        city: 'Davao City',
      }),
    ).rejects.toThrow(
      'You have already successfully registered for this event. You cannot register twice for the same event.',
    );
  });

  it('creates and checks in an onsite attendee when email is marked not applicable', async () => {
    const event = {
      ...makeEvent(),
      id: 'evt_no_email',
      agenda: null,
      tiers: [{ id: 'tier_1', name: 'Visitor', totalQuantity: 100, price: 0, currency: 'PHP' }],
    };
    const createdAttendee = {
      id: 'attendee_no_email',
      registrationId: 'registration_no_email',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: null,
      phone: '09254626315',
      city: 'Davao City',
    };
    const attendance = {
      id: 'attendance_1',
      attendeeId: createdAttendee.id,
      registrationId: createdAttendee.registrationId,
      eventId: event.id,
      checkInDate: new Date('2026-07-15T00:00:00.000Z'),
      checkedInAt: new Date('2026-07-15T01:00:00.000Z'),
      checkInMethod: 'onsite_qr',
    };
    const tx = {
      attendee: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(createdAttendee),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      attendeeAttendance: {
        create: jest.fn().mockResolvedValue(attendance),
      },
      registration: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { attendeeCount: 0 } }),
        create: jest.fn().mockResolvedValue({
          id: createdAttendee.registrationId,
          referenceNumber: 'AXN-2026-NOEMA',
          tierName: 'Visitor',
          attendees: [createdAttendee],
        }),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
      ticketTier: { update: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const service = new EventsService(prisma, mockRedis, mockWorkspaces);

    const result = await service.handleOnsiteRegistrationScan('msme-week-2026', {
      eventId: event.id,
      tierId: 'tier_1',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      emailNotApplicable: true,
      contactNumber: '09254626315',
      gender: 'male',
      birthday: '1990-01-01',
      city: 'Davao City',
    });

    expect(tx.registration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        attendees: {
          create: expect.objectContaining({
            email: null,
            city: 'Davao City',
          }),
        },
      }),
    }));
    expect(result.created).toBe(true);
    expect(result.attendee.email).toBeNull();
    expect(result.registration.referenceNumber).toBe('AXN-2026-NOEMA');
  });
});
