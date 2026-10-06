import type { Route } from '@playwright/test';
import { expect, test, type BrowserDiagnostics, type Page } from './support/qa-test';

/**
 * Checkout dead end (a real incident), spec docs/specs/checkout-dead-end-and-incomplete-orders.md.
 * All API calls are mocked with page.route, so these run against the built web app only.
 */
const EVENT_SLUG = 'qa-dead-end-event';
const EVENT_ID = 'event-dead-end';
const REGISTRATION_ID = 'registration-dead-end-001';
const ORGANIZER_NAME = 'QA Theatre Company';
const ORGANIZER_SLUG = 'qa-theatre-company';
const API_PATTERN = '**/api/v1/**';

function json(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(status >= 400 ? { success: false, ...(data as object) } : { success: true, data }),
  });
}

const eventBody = (withOrganizer: boolean, organizerName = ORGANIZER_NAME) => ({
  id: EVENT_ID,
  slug: EVENT_SLUG,
  title: 'QA Dead End Event',
  venue: 'QA Hall',
  startsAt: '2027-02-20T01:00:00.000Z',
  isFree: false,
  platformFee: 50,
  eventType: 'standard',
  paymentMethods: [],
  optionalInclusions: [],
  agenda: [],
  tiers: [{ id: 'tier-1', name: 'General Admission', price: 1000, available: 50, maxPerOrder: 10 }],
  organizerName: withOrganizer ? organizerName : null,
  organizerSlug: withOrganizer ? ORGANIZER_SLUG : null,
});

const ownedRegistration = (qty: number, withProof: boolean) => ({
  id: REGISTRATION_ID,
  referenceNumber: 'AXN-QA-DEADEND',
  status: 'proof_submitted',
  isFree: false,
  eventId: EVENT_ID,
  tierId: 'tier-1',
  tierName: 'General Admission',
  unitPrice: 1000,
  attendeeCount: qty,
  subtotal: 1000 * qty,
  fees: 50,
  total: 1000 * qty + 50,
  discount: 0,
  notes: null,
  holdExpiresAt: null,
  attendees: [],
  proofs: withProof ? [{ id: 'proof-1', status: 'pending', imageUrl: 'https://example.com/p.png' }] : [],
  event: { title: 'QA Dead End Event', slug: EVENT_SLUG, startsAt: '2027-02-20T01:00:00.000Z', venue: 'QA Hall', paymentMethods: [] },
});

interface ApiOptions {
  /** What GET /registrations/:id answers. */
  read: 'owned' | 'notFound' | 'serverError';
  /** What PATCH /registrations/:id/attendees answers. */
  save?: 200 | 404;
  qty?: number;
  withProof?: boolean;
  withOrganizer?: boolean;
  loggedIn?: boolean;
  organizerName?: string;
  /** Holds the event lookup back, to prove the screen waits for it. */
  eventDelayMs?: number;
  /** Mocked guest read (for the guest-token-while-logged-in case). */
  guestRead?: boolean;
}

async function installApi(page: Page, options: ApiOptions) {
  const { read, save = 200, qty = 1, withProof = true, withOrganizer = true, loggedIn = true, organizerName, eventDelayMs = 0, guestRead = false } = options;
  if (loggedIn) {
    await page.addInitScript(() => {
      window.localStorage.setItem('axon_tickets_rt', 'qa-refresh-token');
      window.localStorage.setItem('axon_tickets_portal', 'customer');
    });
  }
  const seen = { saves: 0, reads: 0, guestReads: 0, eventReads: 0, funnel: [] as Array<Record<string, any>> };
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path.endsWith('/funnel/events') && method === 'POST') {
      seen.funnel.push(JSON.parse(request.postData() ?? '{}'));
      return json(route, { accepted: true }, 201);
    }
    if (path.endsWith('/auth/refresh') && method === 'POST') {
      return json(route, { accessToken: 'qa-access-token', refreshToken: 'qa-refresh-token' });
    }
    if (path.endsWith('/auth/me') && method === 'GET') {
      return json(route, { id: 'user-qa-001', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', isAdmin: false, isOrganizer: false, isVerified: true });
    }
    if (path.endsWith('/users/me') && method === 'GET') {
      return json(route, { id: 'user-qa-001', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', phone: '+639171234567', birthday: null, gender: null, city: 'Davao City' });
    }
    if (path.endsWith('/users/me') && method === 'PATCH') return json(route, {});
    if (path.endsWith(`/events/${EVENT_SLUG}`) && method === 'GET') {
      seen.eventReads += 1;
      if (eventDelayMs) await new Promise((resolve) => setTimeout(resolve, eventDelayMs));
      return json(route, eventBody(withOrganizer, organizerName));
    }
    if (path.endsWith(`/registrations/${REGISTRATION_ID}/attendees`) && method === 'PATCH') {
      seen.saves += 1;
      return save === 200 ? json(route, { message: 'Attendees updated', registrationId: REGISTRATION_ID }) : json(route, { message: 'Registration not found' }, 404);
    }
    if (path.endsWith(`/registrations/guest/${REGISTRATION_ID}`) && method === 'GET') {
      seen.guestReads += 1;
      return guestRead ? json(route, ownedRegistration(qty, withProof)) : json(route, { message: 'Not found' }, 404);
    }
    if (path.endsWith(`/registrations/${REGISTRATION_ID}`) && method === 'GET') {
      seen.reads += 1;
      if (read === 'owned') return json(route, ownedRegistration(qty, withProof));
      if (read === 'notFound') return json(route, { message: 'Registration not found' }, 404);
      return json(route, { message: 'Boom' }, 500);
    }
    return json(route, {}, 404);
  });
  return seen;
}

const registerUrl = (qty = 1) =>
  `/events/${EVENT_SLUG}/register?registrationId=${REGISTRATION_ID}&tierId=tier-1&qty=${qty}`;
const paymentUrl = `/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}`;

/** Only a 404 resource-load line is expected from the mocked "not found" answers. */
function expectOnlyExpectedNotFound(diagnostics: BrowserDiagnostics) {
  expect(diagnostics.pageErrors, 'Unhandled page errors').toEqual([]);
  expect(diagnostics.serverErrors, 'HTTP 5xx responses').toEqual([]);
  const unexpected = diagnostics.consoleErrors.filter((line) => !/status of 404/.test(line));
  expect(unexpected, 'Browser console errors other than the mocked 404').toEqual([]);
}

const funnelSteps = (seen: { funnel: Array<Record<string, any>> }) => seen.funnel.map((body) => body.step);

test.describe('blocked registration: "We couldn\'t open this registration"', () => {
  test('a logged-in visitor on an order that is not theirs sees the screen, and no attendee save is sent', async ({ page, diagnostics }) => {
    const seen = await installApi(page, { read: 'notFound' });
    await page.goto(registerUrl());

    const screen = page.getByTestId('reservation-notyours');
    await expect(screen).toBeVisible();
    await expect(screen.getByRole('heading', { name: "We couldn't open this registration" })).toBeVisible();
    await expect(screen).toContainText('may have been started with a different email or account');
    await expect(screen).toContainText('If you already paid:');
    await expect(screen).toContainText('Note the amount, the time you paid, and the reference number');
    await expect(screen).toContainText("If you haven't paid yet:");

    // Contact is the main action; Start again is the quieter button after it.
    const contact = screen.getByTestId('notyours-contact');
    await expect(contact).toHaveText(`Contact ${ORGANIZER_NAME}`);
    await expect(contact).toHaveAttribute('href', `/organizers/${ORGANIZER_SLUG}#official-links`);
    await expect(screen.getByText('Opens their page. Look for "Official links" to reach them.')).toBeVisible();
    const describedBy = await contact.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText('Official links');
    const start = screen.getByTestId('notyours-start-again');
    await expect(start).toBeVisible();
    const [contactBox, startBox] = [await contact.boundingBox(), await start.boundingBox()];
    expect(contactBox!.y).toBeLessThan(startBox!.y);
    expect(contactBox!.height).toBeGreaterThanOrEqual(44);
    expect(startBox!.height).toBeGreaterThanOrEqual(44);

    // Plain words: no "sign-in", no "order", no email address, no mailto link.
    const text = (await screen.innerText()).toLowerCase();
    expect(text).not.toMatch(/sign-in|\border\b|@/);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

    // One page heading (the hidden "Your registration"), no skipped level; the title is the h2.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Your registration');
    // The helper line is at least 16 px; Start again is the outlined button (white fill, border).
    const helper = page.locator(`[id="${describedBy}"]`);
    expect(parseFloat(await helper.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await start.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(parseFloat(await start.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(2);
    expect(await contact.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');

    expect(seen.reads).toBe(1); // asked once, not twice
    expect(seen.saves).toBe(0);
    await expect.poll(() => funnelSteps(seen)).toContain('order_not_owned_seen');
    const blocked = seen.funnel.find((body) => body.step === 'order_not_owned_seen')!;
    expect(blocked.status).toBe('blocked');
    expect(blocked.metadata.where).toBe('register');
    expectOnlyExpectedNotFound(diagnostics);
  });

  test('a guest who holds the order token while logged in is never sent to the blocked screen', async ({ page }) => {
    const seen = await installApi(page, { read: 'notFound', guestRead: true });
    await page.addInitScript(([id]) => {
      window.sessionStorage.setItem(`axon_guest_registration_${id}`, 'qa-guest-token');
    }, [REGISTRATION_ID]);
    await page.goto(`${registerUrl()}&guest=1`);
    await expect.poll(() => seen.guestReads).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(800);
    await expect(page.getByTestId('reservation-notyours')).toHaveCount(0);
    expect(seen.reads).toBe(0); // the owner-only lookup is never made on the guest path
  });

  test('the "Start again" button goes back to the event page', async ({ page }) => {
    await installApi(page, { read: 'notFound' });
    await page.goto(registerUrl());
    await page.getByTestId('notyours-start-again').click();
    await page.waitForURL(`**/events/${EVENT_SLUG}`);
  });

  test('with no organizer page: no Contact link, the reworded paragraph, and Start again only', async ({ page, diagnostics }) => {
    await installApi(page, { read: 'notFound', withOrganizer: false });
    await page.goto(registerUrl());

    const screen = page.getByTestId('reservation-notyours');
    await expect(screen).toBeVisible();
    await expect(screen.getByTestId('notyours-contact')).toHaveCount(0);
    await expect(screen).toContainText('get in touch with the people who run this event, using the page or post where you first found it');
    await expect(screen.getByTestId('notyours-start-again')).toBeVisible();
    expect((await screen.innerText()).toLowerCase()).not.toMatch(/sign-in|\border\b|@/);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    expectOnlyExpectedNotFound(diagnostics);
  });

  test('a server error on the ownership check does not block: the normal form is shown', async ({ page }) => {
    await installApi(page, { read: 'serverError' });
    await page.goto(registerUrl());
    await expect(page.getByRole('button', { name: 'Confirm Transaction' })).toBeVisible();
    await expect(page.getByTestId('reservation-notyours')).toHaveCount(0);
  });

  test('a 404 when saving the attendees shows the screen after exactly one request, with no retry', async ({ page, diagnostics }) => {
    const seen = await installApi(page, { read: 'owned', save: 404 });
    await page.goto(registerUrl());

    const confirm = page.getByRole('button', { name: 'Confirm Transaction' });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId('reservation-notyours')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(seen.saves).toBe(1);
    await expect(page.getByRole('button', { name: 'Confirm Transaction' })).toHaveCount(0);

    await expect.poll(() => funnelSteps(seen)).toEqual(
      expect.arrayContaining(['details_confirm_started', 'details_confirm_failed', 'order_not_owned_seen']),
    );
    const failed = seen.funnel.find((body) => body.step === 'details_confirm_failed')!;
    expect(failed.status).toBe('failed');
    expect(failed.metadata).toMatchObject({ mode: 'authenticated', httpStatus: 404, code: 'not_found' });
    expect(seen.funnel.find((body) => body.step === 'order_not_owned_seen')!.metadata.where).toBe('confirm');
    expectOnlyExpectedNotFound(diagnostics);
  });

  test('the payment page shows the screen (with one extra event lookup) when the order is not theirs', async ({ page, diagnostics }) => {
    const seen = await installApi(page, { read: 'notFound' });
    await page.goto(paymentUrl);

    const screen = page.getByTestId('reservation-notyours');
    await expect(screen).toBeVisible();
    await expect(page.locator('h1.sr-only')).toHaveText('Your registration');
    await expect(screen.getByTestId('notyours-contact')).toHaveAttribute('href', `/organizers/${ORGANIZER_SLUG}#official-links`);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(seen.eventReads).toBe(1);
    await expect.poll(() => funnelSteps(seen)).toContain('order_not_owned_seen');
    expect(seen.funnel.filter((body) => body.step === 'order_not_owned_seen')).toHaveLength(1);
    expect(seen.funnel.find((body) => body.step === 'order_not_owned_seen')!.metadata.where).toBe('payment');
    expectOnlyExpectedNotFound(diagnostics);
  });

  test('the payment page never shows "Start again" alone first: it waits for the organizer lookup', async ({ page, diagnostics }) => {
    await installApi(page, { read: 'notFound', eventDelayMs: 1200 });
    await page.goto(paymentUrl);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('notyours-start-again')).toHaveCount(0);
    await expect(page.getByTestId('reservation-notyours')).toHaveCount(0);
    const screen = page.getByTestId('reservation-notyours');
    await expect(screen).toBeVisible({ timeout: 8000 });
    await expect(screen.getByTestId('notyours-contact')).toBeVisible();
    await expect(screen.getByTestId('notyours-start-again')).toBeVisible();
    expectOnlyExpectedNotFound(diagnostics);
  });

  test('the payment page still shows the screen, without the link, when the event lookup fails', async ({ page, diagnostics }) => {
    await installApi(page, { read: 'notFound' });
    await page.route(`**/api/v1/events/${EVENT_SLUG}`, (route) => json(route, { message: 'nope' }, 404));
    await page.goto(paymentUrl);
    const screen = page.getByTestId('reservation-notyours');
    await expect(screen).toBeVisible();
    await expect(screen.getByTestId('notyours-contact')).toHaveCount(0);
    await expect(screen.getByTestId('notyours-start-again')).toBeVisible();
    expectOnlyExpectedNotFound(diagnostics);
  });
});

test.describe('blocked registration at 320 px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  for (const withOrganizer of [true, false]) {
    test(`readable without sideways scrolling (${withOrganizer ? 'with' : 'no'} organizer page)`, async ({ page }, testInfo) => {
      await installApi(page, { read: 'notFound', withOrganizer });
      await page.goto(registerUrl());
      const screen = page.getByTestId('reservation-notyours');
      await expect(screen).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      // Body text is at least 16 px (the site scales rem to 112.5%, so text-base renders at 18 px)
      // and left-aligned on this screen.
      const paragraph = screen.locator('p').first();
      expect(parseFloat(await paragraph.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      expect(await paragraph.evaluate((el) => getComputedStyle(el).textAlign)).toBe('left');
      const title = screen.getByRole('heading', { name: "We couldn't open this registration" });
      expect(parseFloat(await title.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);

      const start = screen.getByTestId('notyours-start-again');
      const startBox = (await start.boundingBox())!;
      expect(startBox.height).toBeGreaterThanOrEqual(44);
      // Fold measurement for the PR (viewport is 568 px high).
      const contactBox = withOrganizer ? (await screen.getByTestId('notyours-contact').boundingBox())! : null;
      testInfo.annotations.push({
        type: 'fold-320x568',
        description: `Contact top=${contactBox ? Math.round(contactBox.y) : 'n/a'}px, Start again top=${Math.round(startBox.y)}px`,
      });
    });
  }
});

test.describe('other end screens are unchanged by the new variant', () => {
  test('the "opened elsewhere" screen keeps its centered standard-size message', async ({ page, diagnostics }) => {
    await installApi(page, { read: 'notFound', loggedIn: false });
    await page.addInitScript(([id]) => {
      window.sessionStorage.setItem(`axon_guest_registration_${id}`, 'qa-guest-token');
    }, [REGISTRATION_ID]);
    await page.route(`**/api/v1/registrations/guest/${REGISTRATION_ID}`, (route) => json(route, { message: 'Not found' }, 404));
    await page.goto(paymentUrl);
    const screen = page.getByTestId('reservation-elsewhere');
    await expect(screen).toBeVisible();
    const message = screen.locator('p').first();
    // text-sm on the site's 112.5% root: 15.75 px, centered. The new variant must not have changed this.
    expect(await message.evaluate((el) => getComputedStyle(el).fontSize)).toBe('15.75px');
    expect(await message.evaluate((el) => getComputedStyle(el).textAlign)).toBe('center');
    await expect(screen.getByTestId('notyours-contact')).toHaveCount(0);
    expectOnlyExpectedNotFound(diagnostics);
  });
});

test.describe('blocked registration with a very long organizer name at 320 px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('the Contact button wraps and nothing scrolls sideways', async ({ page }) => {
    const longName = 'The Very Long Named Davao Regional Association of Performing Arts and Cultural Heritage Organizers Incorporated';
    await installApi(page, { read: 'notFound', organizerName: longName });
    await page.goto(registerUrl());
    const contact = page.getByTestId('notyours-contact');
    await expect(contact).toHaveText(`Contact ${longName}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const box = (await contact.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('"One last step" card', () => {
  test('confirmation stage (logged in, one ticket) names the real button and appears once', async ({ page }) => {
    const seen = await installApi(page, { read: 'owned' });
    await page.goto(registerUrl(1));
    const card = page.getByTestId('one-last-step-card');
    await expect(card).toHaveCount(1);
    expect(seen.reads).toBe(1); // the ownership check and the page load share one request
    await expect(card).toContainText("Thank you, we've received your payment screenshot.");
    await expect(card).toContainText('One last step: check your order below, then press Confirm Transaction at the bottom.');
    await expect(card).toContainText('Until you finish, the organizer cannot see your registration.');
    await expect(card).not.toContainText('6-digit code');
    await expect(card).not.toHaveAttribute('role', /.+/);
    await expect(page.getByRole('button', { name: 'Confirm Transaction' })).toBeVisible();
    await expect(page.getByText('Proof uploaded successfully')).toHaveCount(0);
  });

  test('details stage (two tickets) names Review Transaction Details and shows the card on top', async ({ page }) => {
    await installApi(page, { read: 'owned', qty: 2 });
    await page.goto(registerUrl(2));
    const card = page.getByTestId('one-last-step-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('One last step: enter the details of everyone attending, then press Review Transaction Details.');
    await expect(card).toContainText("You'll check everything on the next screen.");
    await expect(card).toContainText('Until you finish, the organizer cannot see your registration.');
    await expect(page.getByRole('button', { name: 'Review Transaction Details' })).toBeVisible();
  });

  test('is not shown when no payment proof is stored', async ({ page }) => {
    await installApi(page, { read: 'owned', withProof: false });
    await page.goto(registerUrl(1));
    await expect(page.getByRole('button', { name: 'Confirm Transaction' })).toBeVisible();
    await expect(page.getByTestId('one-last-step-card')).toHaveCount(0);
    await expect(page.getByText(/received your payment screenshot/)).toHaveCount(0);
  });
});

test.describe('confirm-step tracking', () => {
  test('a successful confirm sends started and succeeded with only the fixed fields we set', async ({ page }) => {
    const seen = await installApi(page, { read: 'owned', save: 200 });
    await page.goto(registerUrl(1));
    const confirm = page.getByRole('button', { name: 'Confirm Transaction' });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(() => funnelSteps(seen)).toEqual(
      expect.arrayContaining(['details_confirm_started', 'details_confirm_succeeded']),
    );

    for (const step of ['details_confirm_started', 'details_confirm_succeeded']) {
      const body = seen.funnel.find((entry) => entry.step === step)!;
      // Everything we set ourselves: the mode only. The tracker adds currentUrl and referrer.
      const ours = Object.keys(body.metadata).filter((key) => !['currentUrl', 'referrer'].includes(key));
      expect(ours).toEqual(['mode']);
      expect(body.metadata.mode).toBe('authenticated');
      expect(body.email ?? null).toBeNull();
      expect(JSON.stringify(body)).not.toMatch(/ada@example\.com|qa-access-token|qa-refresh-token/);
    }
  });

  test('a failed confirm sends only mode, httpStatus and a code from the fixed list', async ({ page, diagnostics }) => {
    const seen = await installApi(page, { read: 'owned', save: 404 });
    await page.goto(registerUrl(1));
    await page.getByRole('button', { name: 'Confirm Transaction' }).click();
    await expect.poll(() => funnelSteps(seen)).toContain('details_confirm_failed');
    const failed = seen.funnel.find((entry) => entry.step === 'details_confirm_failed')!;
    const ours = Object.keys(failed.metadata).filter((key) => !['currentUrl', 'referrer'].includes(key)).sort();
    expect(ours).toEqual(['code', 'httpStatus', 'mode']);
    expect(['not_found', 'validation', 'throttled', 'network', 'server', 'other']).toContain(failed.metadata.code);
    expect(JSON.stringify(failed)).not.toMatch(/Registration not found|ada@example\.com/);
    expectOnlyExpectedNotFound(diagnostics);
  });
});
