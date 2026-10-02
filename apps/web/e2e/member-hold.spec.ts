import type { Route } from '@playwright/test';
import { expect, expectNoBrowserFailures, test, type Page } from './support/qa-test';

const EVENT_SLUG = 'qa-member-hold-event';
const REGISTRATION_ID = 'registration-member-hold-001';
const API_PATTERN = '**/api/v1/**';

function json(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(status >= 400 ? { success: false, ...(data as object) } : { success: true, data }),
  });
}

const registration = (status: string, holdExpiresAt: string | null) => ({
  id: REGISTRATION_ID,
  referenceNumber: 'AXN-QA-HOLD',
  status,
  isFree: false,
  eventId: 'event-member-hold',
  tierId: 'tier-1',
  tierName: 'General Admission',
  unitPrice: 1100,
  attendeeCount: 1,
  subtotal: 1100,
  fees: 50,
  total: 1150,
  discount: 0,
  referralCode: null,
  currency: 'PHP',
  notes: null,
  rejectionReason: null,
  holdExpiresAt,
  createdAt: '2026-07-31T01:00:00.000Z',
  updatedAt: '2026-07-31T01:00:00.000Z',
  event: {
    title: 'QA Member Hold Event',
    slug: EVENT_SLUG,
    startsAt: '2027-02-20T01:00:00.000Z',
    endsAt: '2027-02-20T09:00:00.000Z',
    venue: 'QA Hall',
    address: 'Davao City',
    landmark: null,
    imageUrl: null,
    bankName: null,
    bankAccountNumber: null,
    bankAccountName: null,
    gcashNumber: null,
    paymentMethods: [
      { name: 'GCash', type: 'ewallet', accountName: 'Axon QA', accountNumber: '09170000000', instructions: 'Use the reference.' },
    ],
  },
  attendees: [],
  proofs: [],
});

/** `deadline` is a function so the mock can flip to "cancelled" once the time has passed. */
async function installLoggedInApi(page: Page, deadline: () => number) {
  await page.addInitScript(() => {
    window.localStorage.setItem('axon_tickets_rt', 'qa-refresh-token');
    window.localStorage.setItem('axon_tickets_portal', 'customer');
  });
  const state = { reads: 0 };
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path.endsWith('/funnel/events')) return json(route, { accepted: true }, 201);
    if (path.endsWith('/auth/refresh') && method === 'POST') {
      return json(route, { accessToken: 'qa-access-token', refreshToken: 'qa-refresh-token' });
    }
    if (path.endsWith('/auth/me') && method === 'GET') {
      return json(route, {
        id: 'user-qa-001', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace',
        isAdmin: false, isOrganizer: false, isVerified: true,
      });
    }
    if (path.endsWith('/users/me') && method === 'GET') {
      return json(route, { id: 'user-qa-001', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', phone: '+639171234567', birthday: null, gender: null, city: 'Davao City' });
    }
    if (path.endsWith(`/registrations/${REGISTRATION_ID}`) && method === 'GET') {
      state.reads += 1;
      const expiresAt = deadline();
      return json(
        route,
        Date.now() >= expiresAt
          ? registration('cancelled', null)
          : registration('pending_payment', new Date(expiresAt).toISOString()),
      );
    }
    if (path.endsWith(`/events/${EVENT_SLUG}`) && method === 'GET') return json(route, { id: 'event-member-hold', slug: EVENT_SLUG, title: 'QA Member Hold Event', tiers: [] });
    return json(route, {}, 404);
  });
  return state;
}

test.describe('logged-in customers get the same hold banner and expired screen as guests', () => {
  test('an unpaid hold shows its countdown banner and no guest-only "pay later" card', async ({ page, diagnostics }) => {
    const deadline = Date.now() + 42 * 60_000;
    await installLoggedInApi(page, () => deadline);
    await page.goto(`/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}`);

    await expect(page.getByRole('heading', { name: 'Complete Your Payment' })).toBeVisible();
    const banner = page.getByTestId('hold-banner');
    await expect(banner).toContainText('Upload your proof within');
    await expect(banner).toContainText('After that your seats are released.');
    await expect(banner).toContainText(/Seats are held until \w{3}, \w{3} \d{1,2}, \d{4} · /);

    // Guest-only: the "email me a link" card never appears for a logged-in customer.
    await expect(page.getByRole('button', { name: /I will pay later/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View my registration' })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toHaveCount(0);
    expectNoBrowserFailures(diagnostics);
  });

  test('when the deadline passes the page shows the expired screen, not an error', async ({ page, diagnostics }) => {
    const deadline = Date.now() + 3_000;
    const state = await installLoggedInApi(page, () => deadline);
    await page.goto(`/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}`);
    await expect(page.getByTestId('hold-banner')).toBeVisible();

    const expired = page.getByTestId('reservation-expired');
    await expect(expired).toBeVisible({ timeout: 15_000 });
    await expect(expired).toContainText('Your reservation expired');
    await expect(expired).toContainText('Nothing was charged.');
    await expect(expired.getByRole('button', { name: 'Start again' })).toBeVisible();
    expect(state.reads).toBeGreaterThanOrEqual(2); // it asked the server before saying so
    expectNoBrowserFailures(diagnostics);
  });

  test('an older registration with no deadline shows no banner', async ({ page, diagnostics }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('axon_tickets_rt', 'qa-refresh-token');
      window.localStorage.setItem('axon_tickets_portal', 'customer');
    });
    await installLoggedInApi(page, () => Number.MAX_SAFE_INTEGER);
    await page.route(`**/api/v1/registrations/${REGISTRATION_ID}`, (route) =>
      json(route, registration('pending_payment', null)),
    );
    await page.goto(`/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}`);
    await expect(page.getByRole('heading', { name: 'Complete Your Payment' })).toBeVisible();
    await expect(page.getByTestId('hold-banner')).toHaveCount(0);
    expectNoBrowserFailures(diagnostics);
  });
});
