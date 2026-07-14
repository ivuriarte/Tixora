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
