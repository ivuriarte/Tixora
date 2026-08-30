import { expect, test } from './support/qa-test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  HAS_ADMIN_CREDENTIALS,
  IS_ADMIN_MOCKED,
} from './support/admin-auth';

const API_URL = process.env.API_URL ?? 'https://api-uat.axontickets.online';

function unwrap<T>(payload: { data?: T } | T): T {
  return payload && typeof payload === 'object' && 'data' in payload
    ? (payload as { data: T }).data
    : payload as T;
}

test.describe('Admin/Super Admin live UAT lifecycle', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'The isolated UAT admin identity is not configured.');
  test.skip(IS_ADMIN_MOCKED, 'This suite exercises the real isolated UAT database.');

  test('@critical creates, publishes, registers, verifies, capacity-blocks, and removes an isolated event', async ({ request }) => {
    test.setTimeout(90_000);
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.status()).toBe(200);
    const loginBody = unwrap<{ accessToken: string; user: { isAdmin: boolean } }>(await login.json());
    expect(loginBody.user.isAdmin).toBe(true);
    const headers = { Authorization: `Bearer ${loginBody.accessToken}` };

    let eventId: string | null = null;
    try {
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await request.post(`${API_URL}/api/v1/admin/events`, {
        headers,
        data: {
          title: `PW UAT Lifecycle ${nonce}`,
          description: 'Automated UAT lifecycle fixture. Safe to delete.',
          venue: 'Axon Automated QA Venue',
          address: 'Automated test fixture',
          city: 'Davao City',
          startsAt: '2035-08-11T09:00:00+08:00',
          endsAt: '2035-08-11T17:00:00+08:00',
          maxPerUser: 2,
          maxCapacity: 1,
          isFree: true,
          onsiteRegistrationEnabled: true,
          imageUrl: 'https://uat.axontickets.online/og-image.png',
          agenda: [{ id: 'qa-session', title: 'Automated QA Session', time: '9:00 AM', isSubEvent: true }],
        },
      });
      expect(created.status()).toBe(201);
      const event = unwrap<{ id: string; slug: string }>(await created.json());
      eventId = event.id;

      const tierResponse = await request.post(`${API_URL}/api/v1/admin/events/${event.id}/tiers`, {
        headers,
        data: { name: 'QA Admission', price: 0, totalQuantity: 1, maxPerOrder: 1, isVisible: true },
      });
      expect(tierResponse.status()).toBe(201);
      const tier = unwrap<{ id: string }>(await tierResponse.json());

      const published = await request.put(`${API_URL}/api/v1/admin/events/${event.id}`, {
        headers,
        data: { status: 'on_sale' },
      });
      expect(published.status()).toBe(200);

      const attendee = {
        eventId: event.id,
        tierId: tier.id,
        subEventIds: ['qa-session'],
        firstName: 'Playwright',
        lastName: `Walkin ${nonce}`,
        emailNotApplicable: true,
        contactNumber: '+639171234567',
        gender: 'prefer_not_to_say',
        birthday: '1995-05-20',
        city: 'Davao City',
      };
      const registered = await request.post(`${API_URL}/api/v1/events/${event.slug}/onsite-registration`, {
        data: attendee,
      });
      expect(registered.status()).toBe(201);
      const registration = unwrap<{
        created: boolean;
        attendee: { email: string | null };
        registration: { referenceNumber: string };
        attendance: { checkedInAt: string };
      }>(await registered.json());
      expect(registration.created).toBe(true);
      expect(registration.attendee.email).toBeNull();
      expect(registration.registration.referenceNumber).toMatch(/^AXN-/);
      expect(Date.parse(registration.attendance.checkedInAt)).not.toBeNaN();

      const roster = await request.get(`${API_URL}/api/v1/admin/events/${event.id}/attendees?limit=50`, { headers });
      expect(roster.status()).toBe(200);
      const rosterBody = unwrap<{ data: Array<{ userName: string; status: string }>; meta: { total: number } }>(await roster.json());
      expect(rosterBody.meta.total).toBe(1);
      expect(rosterBody.data[0]).toEqual(expect.objectContaining({
        userName: `Playwright Walkin ${nonce}`,
        status: 'used',
      }));

      const duplicate = await request.post(`${API_URL}/api/v1/events/${event.slug}/onsite-registration`, { data: attendee });
      expect(duplicate.status()).toBe(400);
      expect(await duplicate.text()).toContain('cannot register twice');

      const full = await request.post(`${API_URL}/api/v1/events/${event.slug}/onsite-registration`, {
        data: { ...attendee, firstName: 'Capacity', lastName: `Blocked ${nonce}`, birthday: '1996-06-21' },
      });
      expect(full.status()).toBe(400);
      expect(await full.text()).toContain('No seats are available');
    } finally {
      if (eventId) {
        const removed = await request.delete(`${API_URL}/api/v1/admin/events/${eventId}`, { headers });
        expect(removed.status()).toBe(200);
      }
    }
  });
});
