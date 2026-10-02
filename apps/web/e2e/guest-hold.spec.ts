import type { Route } from '@playwright/test';
import { expect, expectNoBrowserFailures, test, type Page } from './support/qa-test';

const EVENT_ID = 'event-qa-hold';
const EVENT_SLUG = 'qa-hold-event';
const TIER_ID = 'tier-qa-standard';
const REGISTRATION_ID = '3f2a1b9c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const GUEST_TOKEN = 'qa-scoped-guest-token-0123456789abcdef';
const NEW_GUEST_TOKEN = 'qa-rotated-guest-token-0123456789abcd';
const EMAILED_TOKEN = `v1.${REGISTRATION_ID}.1990000000.${'A'.repeat(43)}`;
const API_PATTERN = '**/api/v1/**';

const event = {
  id: EVENT_ID,
  slug: EVENT_SLUG,
  title: 'QA Hold Event',
  description: 'Deterministic Playwright fixture for guest holds.',
  venue: 'QA Convention Hall',
  address: 'Davao City',
  startsAt: '2027-02-20T01:00:00.000Z',
  endsAt: '2027-02-20T09:00:00.000Z',
  status: 'published',
  isFree: false,
  platformFee: 50,
  allowManualPayment: true,
  paymentMethods: [
    { name: 'GCash', type: 'ewallet', accountName: 'Axon QA', accountNumber: '09170000000', instructions: 'Use the reference.' },
  ],
  agenda: [],
  eventType: 'standard',
  tiers: [{ id: TIER_ID, name: 'General Admission', price: 500, available: 50, maxPerOrder: 5, inclusions: [] }],
};

type Behavior = 'ok' | 'notfound' | 'throttled' | 'error';

interface HoldMock {
  status: 'pending_payment' | 'cancelled' | 'proof_submitted';
  /** Offset from now, in minutes, of the deadline the API reports. Null = no deadline. */
  holdMinutes: number | null;
  attendeeCount: number;
  get: Behavior;
  saveForLater: 'ok' | 'mail-failed' | 'throttled' | 'bad-email';
  cancel: 'ok' | 'has-proof' | 'throttled' | 'network';
  proof: 'ok' | 'expired';
  guestIntent: 'ok' | 'limit' | 'throttled';
  resume: 'ok' | 'notfound' | 'error' | 'throttled';
  savedDeadlineMinutes: number;
  calls: {
    saveForLater: Array<{ token: string; body: Record<string, unknown> }>;
    cancel: string[];
    guestIntent: number;
    resume: Array<Record<string, unknown>>;
    guestGets: string[];
    outgoing: string[];
  };
}

function json(route: Route, data: unknown, status = 200) {
  const body =
    status >= 400 && data && typeof data === 'object'
      ? { success: false, ...(data as Record<string, unknown>) }
      : { success: true, data };
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function snapshot(mock: HoldMock) {
  return {
    id: REGISTRATION_ID,
    referenceNumber: 'AXN-2026-QAHLD',
    status: mock.status,
    isFree: false,
    eventId: EVENT_ID,
    tierId: TIER_ID,
    tierName: 'General Admission',
    unitPrice: 500,
    attendeeCount: mock.attendeeCount,
    subtotal: 500 * mock.attendeeCount,
    fees: 50,
    total: 500 * mock.attendeeCount + 50,
    discount: 0,
    referralCode: null,
    currency: 'PHP',
    notes: null,
    rejectionReason: null,
    createdAt: '2026-10-02T01:00:00.000Z',
    updatedAt: '2026-10-02T01:00:00.000Z',
    holdExpiresAt: mock.holdMinutes === null ? null : minutesFromNow(mock.holdMinutes),
    resumeEmailSaved: false,
    event: {
      title: event.title,
      slug: event.slug,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venue: event.venue,
      address: event.address,
      landmark: null,
      imageUrl: null,
      bankName: null,
      bankAccountNumber: null,
      bankAccountName: null,
      gcashNumber: null,
      paymentMethods: event.paymentMethods,
    },
    attendees: [],
    proofs: mock.status === 'proof_submitted' ? [{ id: 'proof-qa', status: 'pending', uploadedAt: '2026-10-02T01:05:00.000Z' }] : [],
  };
}

async function installApi(page: Page, overrides: Partial<HoldMock> = {}): Promise<HoldMock> {
  const mock: HoldMock = {
    status: 'pending_payment',
    holdMinutes: 42,
    attendeeCount: 1,
    get: 'ok',
    saveForLater: 'ok',
    cancel: 'ok',
    proof: 'ok',
    guestIntent: 'ok',
    resume: 'ok',
    savedDeadlineMinutes: 24 * 60,
    calls: { saveForLater: [], cancel: [], guestIntent: 0, resume: [], guestGets: [], outgoing: [] },
    ...overrides,
  };

  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    mock.calls.outgoing.push(`${method} ${request.url()} ${request.postData() ?? ''}`);

    if (path.endsWith(`/events/${EVENT_SLUG}`) && method === 'GET') return json(route, event);
    if (path.endsWith('/funnel/events')) return json(route, { accepted: true }, 201);

    if (path.endsWith('/registrations/guest-intent') && method === 'POST') {
      mock.calls.guestIntent += 1;
      if (mock.guestIntent === 'limit') {
        return json(route, { statusCode: 409, code: 'GUEST_HOLD_LIMIT', message: 'Too many reservations from this connection.' }, 409);
      }
      if (mock.guestIntent === 'throttled') return json(route, { statusCode: 429, message: 'Too Many Requests' }, 429);
      return json(route, { ...snapshot(mock), guestAccessToken: GUEST_TOKEN }, 201);
    }

    if (path.endsWith('/registrations/guest/resume') && method === 'POST') {
      mock.calls.resume.push(request.postDataJSON() as Record<string, unknown>);
      if (mock.resume === 'notfound') return json(route, { statusCode: 404, message: 'This link is no longer valid.' }, 404);
      if (mock.resume === 'throttled') return json(route, { statusCode: 429, message: 'Too many attempts.' }, 429);
      if (mock.resume === 'error') return route.abort('failed');
      return json(route, {
        registrationId: REGISTRATION_ID,
        eventSlug: EVENT_SLUG,
        guestAccessToken: NEW_GUEST_TOKEN,
        holdExpiresAt: minutesFromNow(mock.holdMinutes ?? 42),
      });
    }

    const guestPath = `/registrations/guest/${REGISTRATION_ID}`;
    if (path.endsWith(`${guestPath}/save-for-later`) && method === 'POST') {
      mock.calls.saveForLater.push({
        token: request.headers()['x-registration-token'] ?? '',
        body: request.postDataJSON() as Record<string, unknown>,
      });
      if (mock.saveForLater === 'mail-failed') return json(route, { statusCode: 503, message: 'We could not send the email right now.' }, 503);
      if (mock.saveForLater === 'throttled') return json(route, { statusCode: 429, message: 'Too Many Requests' }, 429);
      if (mock.saveForLater === 'bad-email') return json(route, { statusCode: 400, message: ['email must be an email'] }, 400);
      return json(route, {
        message: 'If the address is right, your link is on its way.',
        holdExpiresAt: minutesFromNow(mock.savedDeadlineMinutes),
      });
    }
    if (path.endsWith(`${guestPath}/cancel`) && method === 'POST') {
      mock.calls.cancel.push(request.headers()['x-registration-token'] ?? '');
      if (mock.cancel === 'has-proof') return json(route, { statusCode: 400, code: 'HAS_PROOF', message: 'Already has a proof.' }, 400);
      if (mock.cancel === 'throttled') return json(route, { statusCode: 429, message: 'Too Many Requests' }, 429);
      if (mock.cancel === 'network') return route.abort('failed');
      mock.status = 'cancelled';
      return json(route, { message: 'Reservation cancelled' });
    }
    if (path.endsWith(guestPath) && method === 'GET') {
      mock.calls.guestGets.push(request.headers()['x-registration-token'] ?? '');
      if (mock.get === 'notfound') return json(route, { statusCode: 404, message: 'Registration not found' }, 404);
      if (mock.get === 'throttled') return json(route, { statusCode: 429, message: 'Too Many Requests' }, 429);
      if (mock.get === 'error') return route.abort('failed');
      return json(route, snapshot(mock));
    }
    if (path.endsWith('/payment-proofs/guest') && method === 'POST') {
      if (mock.proof === 'expired') {
        return json(route, { statusCode: 400, code: 'HOLD_EXPIRED', message: 'This reservation expired or was cancelled. Please start again.' }, 400);
      }
      mock.status = 'proof_submitted';
      return json(route, { imageUrl: 'https://example.test/proof.png' }, 201);
    }
    return route.continue();
  });
  return mock;
}

async function seedGuestToken(page: Page, token = GUEST_TOKEN) {
  await page.addInitScript(
    ({ registrationId, value }) => {
      window.sessionStorage.setItem(`axon_guest_registration_${registrationId}`, value);
    },
    { registrationId: REGISTRATION_ID, value: token },
  );
}

async function openPayment(page: Page, overrides: Partial<HoldMock> = {}, query = '') {
  await seedGuestToken(page);
  const mock = await installApi(page, overrides);
  await page.goto(`/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}${query}`);
  return mock;
}

test.describe('Guest hold: payment page', () => {
  test('shows how long the seats are held, with the digits hidden from screen readers', async ({ page, diagnostics }) => {
    await openPayment(page, { holdMinutes: 42 });
    const banner = page.getByTestId('hold-banner');
    await expect(banner).toContainText('Upload your proof within');
    await expect(banner).toContainText(/4[12]:\d\d/);
    await expect(banner.locator('[aria-hidden="true"]')).toContainText(/4[12]:\d\d/);
    await expect(banner).toContainText(/Seats are held until \w{3}, \w{3} \d{1,2}, \d{4} · \d{1,2}:\d{2} (AM|PM)/);
    expectNoBrowserFailures(diagnostics);
  });

  test('switches to plain urgent wording in the last five minutes', async ({ page }) => {
    await openPayment(page, { holdMinutes: 4 });
    const banner = page.getByTestId('hold-banner');
    await expect(banner).toContainText(/Only\s*[0-4]:\d\d/);
    await expect(banner).toContainText('left');
    // Screen readers skip the ticking digits and read the static equivalent instead.
    await expect(banner.locator('.sr-only')).toContainText(/about \d+ minutes/);
  });

  test('shows the held-until date when more than two hours remain', async ({ page }) => {
    await openPayment(page, { holdMinutes: 24 * 60 });
    await expect(page.getByTestId('hold-banner')).toContainText(/Your seats are held until \w{3}, \w{3} \d{1,2}, \d{4} · /);
  });

  test('shows no banner at all for a registration without a deadline', async ({ page }) => {
    await openPayment(page, { holdMinutes: null });
    await expect(page.getByRole('heading', { name: 'Complete Your Payment' })).toBeVisible();
    await expect(page.getByTestId('hold-banner')).toHaveCount(0);
  });

  test('notes when an expired reservation was replaced by a new one', async ({ page }) => {
    await openPayment(page, { holdMinutes: 50 }, '?renewed=1');
    await expect(page.getByText('Your earlier reservation expired, so we started a new one.')).toBeVisible();
  });
});

test.describe('Guest hold: I will pay later', () => {
  test('emails a link, shows the real deadline and sends the token only in the header', async ({ page, diagnostics }) => {
    const mock = await openPayment(page);
    await page.getByRole('button', { name: 'I will pay later' }).click();

    await expect(page.getByText(/We'll email you a link and hold your seats for 24 hours\. No email\? Your seats are held for 60 minutes only/)).toBeVisible();
    const email = page.getByLabel('Email for your link (optional)');
    await expect(email).toBeFocused();
    await expect(page.getByRole('button', { name: 'Email me my link' })).toBeDisabled();

    await email.fill('juan@example.com');
    await page.getByRole('button', { name: 'Email me my link' }).click();

    const confirmation = page.getByRole('status').filter({ hasText: 'on its way to j***@example.com' });
    await expect(confirmation).toContainText('If the address is right, your link is on its way to j***@example.com.');
    await expect(confirmation).toContainText(/Your seats are held until \w{3}, \w{3} \d{1,2}, \d{4} · /);
    // The banner at the top of the page now shows the same, longer deadline the server returned.
    await expect(page.getByTestId('hold-banner')).toContainText(/Your seats are held until \w{3}, \w{3} \d{1,2}, \d{4} · /);
    expect(mock.calls.saveForLater).toEqual([{ token: GUEST_TOKEN, body: { email: 'juan@example.com' } }]);
    await expect(page.getByRole('button', { name: 'Upload proof now' })).toBeVisible();
    expectNoBrowserFailures(diagnostics);
  });

  test('the funnel event for saving an email carries no email address and no token', async ({ page }) => {
    const mock = await openPayment(page);
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await page.getByLabel('Email for your link (optional)').fill('juan@example.com');
    await page.getByRole('button', { name: 'Email me my link' }).click();
    await expect(page.getByText(/is on its way to/)).toBeVisible();

    const funnelCalls = mock.calls.outgoing.filter((line) => line.includes('/funnel/events') && line.includes('hold_email_saved'));
    expect(funnelCalls.length).toBeGreaterThan(0);
    for (const call of funnelCalls) {
      expect(call).not.toContain('juan@example.com');
      expect(call).not.toContain(GUEST_TOKEN);
      // The tracker adds the page URL (path and query, never a fragment) to every funnel event.
      expect(call).not.toContain('#');
    }
  });

  test('rejects an address that cannot be right without calling the server', async ({ page }) => {
    const mock = await openPayment(page);
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await page.getByLabel('Email for your link (optional)').fill('juan@exmple');
    await page.getByRole('button', { name: 'Email me my link' }).click();

    const alert = page.getByRole('alert').filter({ hasText: "doesn't look right" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/still held until/);
    await expect(page.getByLabel('Email for your link (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(mock.calls.saveForLater).toHaveLength(0);
  });

  test('a mail-provider failure keeps the seats and offers a retry and the copy link', async ({ page }) => {
    await openPayment(page, { saveForLater: 'mail-failed' });
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await page.getByLabel('Email for your link (optional)').fill('juan@example.com');
    await page.getByRole('button', { name: 'Email me my link' }).click();

    const alert = page.getByRole('alert').filter({ hasText: "couldn't send the email right now" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/still held until/);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy my link' })).toBeVisible();
  });

  test('too many requests disables sending but leaves the copy link available', async ({ page }) => {
    await openPayment(page, { saveForLater: 'throttled' });
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await page.getByLabel('Email for your link (optional)').fill('juan@example.com');
    await page.getByRole('button', { name: 'Email me my link' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Too many requests' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email me my link' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Copy my link' })).toBeEnabled();
  });

  test('copies a link that works in any browser, and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPayment(page);
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await expect(page.getByText(/Anyone with a copied link can open your reservation/)).toBeVisible();
    await page.getByRole('button', { name: 'Copy my link' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(new RegExp(`/events/${EVENT_SLUG}/register/resume#r=${REGISTRATION_ID}\\.${GUEST_TOKEN}$`));
  });

  test('offers the link to select by hand when the browser blocks copying', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('blocked')) },
        configurable: true,
      });
    });
    await openPayment(page);
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await page.getByRole('button', { name: 'Copy my link' }).click();

    await expect(page.getByText('Your browser blocked copying.')).toBeVisible();
    await expect(page.getByLabel('Your link', { exact: true })).toHaveValue(new RegExp(`#r=${REGISTRATION_ID}\\.`));
  });

  test('leaving without an email goes back to the event and extends nothing', async ({ page }) => {
    const mock = await openPayment(page);
    await page.getByRole('button', { name: 'I will pay later' }).click();
    await page.getByRole('button', { name: 'No thanks, take me back to the event' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_SLUG}$`));
    expect(mock.calls.saveForLater).toHaveLength(0);
  });
});

test.describe('Guest hold: cancel and expiry', () => {
  test('cancelling releases the seats and lands on a clear confirmation', async ({ page }) => {
    const mock = await openPayment(page);
    await page.getByRole('button', { name: 'Cancel reservation' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Cancel this reservation?');
    await expect(dialog).toContainText('Your seats go back on sale right away. Nothing was charged.');
    await expect(dialog.getByRole('button', { name: 'Keep my seats' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel reservation' }).click();

    await expect(page.getByRole('heading', { name: 'Your reservation was cancelled' })).toBeVisible();
    expect(mock.calls.cancel).toEqual([GUEST_TOKEN]);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_SLUG}$`));
  });

  test('keeping the seats closes the dialog and cancels nothing', async ({ page }) => {
    const mock = await openPayment(page);
    await page.getByRole('button', { name: 'Cancel reservation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep my seats' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mock.calls.cancel).toHaveLength(0);
  });

  test('a proof that was already uploaded explains why it cannot be cancelled and offers the upload', async ({ page }) => {
    await openPayment(page, { cancel: 'has-proof' });
    await page.getByRole('button', { name: 'Cancel reservation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText("This reservation can't be cancelled here");
    await expect(dialog.getByRole('button', { name: 'Upload proof' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('a network failure on cancel offers a retry', async ({ page }) => {
    await openPayment(page, { cancel: 'network' });
    await page.getByRole('button', { name: 'Cancel reservation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText("We couldn't cancel your reservation");
    await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('a reservation the server already cancelled shows the expired screen', async ({ page }) => {
    await openPayment(page, { status: 'cancelled' });
    await expect(page.getByRole('heading', { name: 'Your reservation expired' })).toBeVisible();
    await expect(page.getByText('Nothing was charged.')).toBeVisible();
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_SLUG}$`));
  });

  test('uploading proof after the hold ended shows the expired screen, not a raw error', async ({ page }) => {
    await openPayment(page, { proof: 'expired' });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await page.getByRole('button', { name: 'Upload payment proof', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your reservation expired' })).toBeVisible();
    await expect(page.getByText(/Cannot upload proof/)).toHaveCount(0);
  });

  test('a missing reservation is called "opened elsewhere" unless the saved deadline has passed', async ({ page }) => {
    await openPayment(page, { get: 'notfound' });
    await expect(page.getByRole('heading', { name: "We couldn't open this reservation here" })).toBeVisible();
    await expect(page.getByText(/may have been opened on another device/)).toBeVisible();
  });

  test('a missing reservation whose saved deadline already passed is called expired', async ({ page }) => {
    await page.addInitScript(
      ({ registrationId }) => {
        window.sessionStorage.setItem(`axon_guest_deadline_${registrationId}`, new Date(Date.now() - 60_000).toISOString());
      },
      { registrationId: REGISTRATION_ID },
    );
    await openPayment(page, { get: 'notfound' });
    await expect(page.getByRole('heading', { name: 'Your reservation expired' })).toBeVisible();
  });

  test('too many requests on load says to wait and offers a retry', async ({ page }) => {
    await openPayment(page, { get: 'throttled' });
    await expect(page.getByRole('heading', { name: 'Too many attempts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('Guest hold: resume page', () => {
  test('an emailed link is exchanged, the secret leaves the address bar and the guest lands on payment', async ({ page, diagnostics }) => {
    const mock = await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register/resume#t=${EMAILED_TOKEN}`);

    await expect(page).toHaveURL(new RegExp(`/register/payment/${REGISTRATION_ID}$`));
    expect(page.url()).not.toContain('#');
    expect(page.url()).not.toContain(EMAILED_TOKEN);
    expect(mock.calls.resume).toEqual([{ token: EMAILED_TOKEN }]);
    const stored = await page.evaluate((id) => window.sessionStorage.getItem(`axon_guest_registration_${id}`), REGISTRATION_ID);
    expect(stored).toBe(NEW_GUEST_TOKEN);
    expect(await page.evaluate(() => window.sessionStorage.getItem('axon_resume_fragment'))).toBeNull();
    await expect(page.getByRole('heading', { name: 'Complete Your Payment' })).toBeVisible();
    expectNoBrowserFailures(diagnostics);
  });

  test('the secret never appears in any request other than the exchange itself', async ({ page }) => {
    const mock = await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register/resume#t=${EMAILED_TOKEN}`);
    await expect(page).toHaveURL(/register\/payment/);
    await page.waitForLoadState('networkidle');

    const leaks = mock.calls.outgoing.filter(
      (line) => line.includes(EMAILED_TOKEN) && !line.includes('/registrations/guest/resume'),
    );
    expect(leaks).toEqual([]);
    for (const line of mock.calls.outgoing.filter((l) => l.includes('/funnel/events'))) {
      expect(line).not.toContain('#t=');
      expect(line).not.toContain('#r=');
    }
  });

  test('a copied link is validated with the guest read, without rotating anything', async ({ page }) => {
    const mock = await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register/resume#r=${REGISTRATION_ID}.${GUEST_TOKEN}`);

    await expect(page).toHaveURL(new RegExp(`/register/payment/${REGISTRATION_ID}$`));
    expect(page.url()).not.toContain(GUEST_TOKEN);
    expect(mock.calls.resume).toHaveLength(0);
    expect(mock.calls.guestGets[0]).toBe(GUEST_TOKEN);
    const stored = await page.evaluate((id) => window.sessionStorage.getItem(`axon_guest_registration_${id}`), REGISTRATION_ID);
    expect(stored).toBe(GUEST_TOKEN);
  });

  test('a copied link for a cancelled reservation is called invalid and never offers an upload', async ({ page }) => {
    await installApi(page, { status: 'cancelled' });
    await page.goto(`/events/${EVENT_SLUG}/register/resume#r=${REGISTRATION_ID}.${GUEST_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload payment proof' })).toHaveCount(0);
  });

  test('an expired or unknown link gets the same plain "no longer valid" message', async ({ page }) => {
    await installApi(page, { resume: 'notfound' });
    await page.goto(`/events/${EVENT_SLUG}/register/resume#t=${EMAILED_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible();
    await expect(page.getByText(/Nothing was charged/)).toBeVisible();
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_SLUG}$`));
  });

  test('a network failure offers a retry and never claims the link is dead', async ({ page }) => {
    const mock = await installApi(page, { resume: 'error' });
    await page.goto(`/events/${EVENT_SLUG}/register/resume#t=${EMAILED_TOKEN}`);
    await expect(page.getByRole('heading', { name: "We couldn't open your reservation" })).toBeVisible();
    await expect(page.getByText('Your seats are still held.')).toBeVisible();
    await expect(page.getByText('This link is no longer valid')).toHaveCount(0);

    mock.resume = 'ok';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(new RegExp(`/register/payment/${REGISTRATION_ID}$`));
    expect(mock.calls.resume.length).toBe(2);
  });

  test('a link that lost its token says it looks incomplete', async ({ page }) => {
    await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register/resume`);
    await expect(page.getByRole('heading', { name: 'This link looks incomplete' })).toBeVisible();
    await page.goto(`/events/${EVENT_SLUG}/register/resume#t=garbage`);
    await expect(page.getByRole('heading', { name: 'This link looks incomplete' })).toBeVisible();
  });

  test('the page is private: noindex, no referrer, never cached', async ({ page }) => {
    await installApi(page, { resume: 'notfound' });
    const response = await page.goto(`/events/${EVENT_SLUG}/register/resume#t=${EMAILED_TOKEN}`);
    const headers = response?.headers() ?? {};
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control']).toContain('no-store');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle('Resuming your reservation | Axon Tickets');
  });
});

test.describe('Guest hold: starting checkout', () => {
  test('shows a calm limit message, not a raw error, when too many holds were started', async ({ page }) => {
    await installApi(page, { guestIntent: 'limit' });
    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=1`);
    await expect(page.getByRole('heading', { name: 'Too many reservations from this connection' })).toBeVisible();
    await expect(page.getByText('Finish or cancel one you already started, or try again in about an hour.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to event' })).toBeVisible();
  });

  test('too many requests asks the guest to wait and offers a retry', async ({ page }) => {
    await installApi(page, { guestIntent: 'throttled' });
    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=1`);
    await expect(page.getByRole('heading', { name: 'Too many attempts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('coming back with the same choice reuses the hold instead of starting another', async ({ page }) => {
    await seedGuestToken(page);
    await page.addInitScript(
      ({ eventId, registrationId, tierId }) => {
        window.sessionStorage.setItem(
          `axon_guest_hold_${eventId}`,
          JSON.stringify({ registrationId, tierId, qty: 1 }),
        );
      },
      { eventId: EVENT_ID, registrationId: REGISTRATION_ID, tierId: TIER_ID },
    );
    const mock = await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=1`);

    await expect(page).toHaveURL(new RegExp(`/register/payment/${REGISTRATION_ID}$`));
    expect(mock.calls.guestIntent).toBe(0);
  });

  test('changing the quantity releases the old seats and starts a new hold', async ({ page }) => {
    await seedGuestToken(page);
    await page.addInitScript(
      ({ eventId, registrationId, tierId }) => {
        window.sessionStorage.setItem(
          `axon_guest_hold_${eventId}`,
          JSON.stringify({ registrationId, tierId, qty: 1 }),
        );
      },
      { eventId: EVENT_ID, registrationId: REGISTRATION_ID, tierId: TIER_ID },
    );
    const mock = await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=2`);

    await expect(page).toHaveURL(/register\/payment\//);
    expect(mock.calls.cancel).toEqual([GUEST_TOKEN]);
    expect(mock.calls.guestIntent).toBe(1);
  });

  test('an expired earlier hold is replaced and the guest is told', async ({ page }) => {
    await seedGuestToken(page);
    await page.addInitScript(
      ({ eventId, registrationId, tierId }) => {
        window.sessionStorage.setItem(
          `axon_guest_hold_${eventId}`,
          JSON.stringify({ registrationId, tierId, qty: 1 }),
        );
      },
      { eventId: EVENT_ID, registrationId: REGISTRATION_ID, tierId: TIER_ID },
    );
    const mock = await installApi(page, { status: 'cancelled' });
    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=1`);

    await expect(page).toHaveURL(/register\/payment\/.*renewed=1/);
    expect(mock.calls.guestIntent).toBe(1);
  });

  test('remembers the new hold for next time', async ({ page }) => {
    await installApi(page);
    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=1`);
    await expect(page).toHaveURL(/register\/payment\//);
    const remembered = await page.evaluate((eventId) => window.sessionStorage.getItem(`axon_guest_hold_${eventId}`), EVENT_ID);
    expect(JSON.parse(remembered ?? '{}')).toEqual({ registrationId: REGISTRATION_ID, tierId: TIER_ID, qty: 1 });
  });
});
