import type { Route } from '@playwright/test';
import { expect, expectNoBrowserFailures, test, type Page } from './support/qa-test';

const API_PATTERN = '**/api/v1/**';
const EVENT_ID = 'event-onsite-qa';
const EVENT_SLUG = 'onsite-qa-event';
const TIER_ID = 'tier-onsite-general';

interface Options {
  enabled?: boolean;
  status?: string;
  failure?: 'duplicate' | 'capacity';
}

interface State {
  eventRequests: URL[];
  suggestionRequests: number;
  submissions: Array<Record<string, unknown>>;
}

function body(data: unknown, status = 200) {
  return status >= 400 && data && typeof data === 'object'
    ? { success: false, ...(data as Record<string, unknown>) }
    : { success: true, data };
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body(data, status)) });
}

function eventFixture(options: Options) {
  return {
    id: EVENT_ID,
    slug: EVENT_SLUG,
    title: 'On-site QA Conference',
    venue: 'QA Convention Hall',
    startsAt: '2030-05-20T01:00:00.000Z',
    status: options.status ?? 'on_sale',
    onsiteRegistrationEnabled: options.enabled ?? true,
    tiers: [
      { id: TIER_ID, name: 'General Admission', availableQuantity: 25, isSoldOut: false },
      { id: 'tier-onsite-vip', name: 'VIP', availableQuantity: 5, isSoldOut: false },
    ],
    agenda: [
      { id: 'session-opening', title: 'Opening Plenary', time: '9:00 AM', isSubEvent: true },
      { id: 'session-workshop', title: 'QA Workshop', time: '1:00 PM', isSubEvent: true },
    ],
  };
}

async function installApi(page: Page, options: Options = {}) {
  const state: State = { eventRequests: [], suggestionRequests: 0, submissions: [] };
  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (method === 'GET' && path.endsWith(`/events/${EVENT_SLUG}`)) {
      state.eventRequests.push(url);
      return json(route, eventFixture(options));
    }
    if (method === 'POST' && path.endsWith('/onsite-registration/suggestions')) {
      state.suggestionRequests += 1;
      return json(route, { match: null });
    }
    if (method === 'POST' && path.endsWith(`/events/${EVENT_SLUG}/onsite-registration`)) {
      const payload = request.postDataJSON() as Record<string, unknown>;
      state.submissions.push(payload);
      if (options.failure === 'duplicate') {
        return json(route, { message: 'You have already successfully registered for this event. You cannot register twice for the same event.' }, 400);
      }
      if (options.failure === 'capacity') {
        return json(route, { message: 'No seats are available for this ticket tier.' }, 400);
      }
      return json(route, {
        created: true,
        attendee: {
          id: 'attendee-onsite-qa',
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: typeof payload.email === 'string' ? payload.email : null,
        },
        registration: { id: 'registration-onsite-qa', referenceNumber: 'AXN-ONSITE-QA', tierName: 'General Admission' },
        attendance: { id: 'attendance-onsite-qa', checkInDate: '2030-05-20', checkedInAt: '2030-05-20T01:15:00.000Z' },
      });
    }
    return json(route, { message: `Unhandled on-site QA route: ${method} ${path}` }, 501);
  });
  return state;
}

async function open(page: Page, options: Options = {}) {
  const state = await installApi(page, options);
  await page.goto(`/events/${EVENT_SLUG}/onsite?eventId=${EVENT_ID}`);
  await expect(page.getByRole('heading', { name: 'On-site QA Conference' })).toBeVisible();
  return state;
}

async function fillRequired(page: Page, email = 'walkin@example.com') {
  await page.getByLabel(/^First name/).fill('Walkin');
  await page.getByLabel(/^Last name/).fill('Attendee');
  await page.getByLabel(/^Email \*/).fill(email);
  await page.getByLabel(/^Contact number/).fill('+639171234567');
  await page.getByLabel('Gender').selectOption('prefer_not_to_say');
  await page.getByLabel(/^Birthday/).fill('1995-05-20');
  await page.getByLabel(/^City/).fill('Davao City');
}

function allowExpected400(diagnostics: { consoleErrors: string[] }) {
  const index = diagnostics.consoleErrors.findIndex((message) => message.includes('400 (Bad Request)'));
  if (index >= 0) diagnostics.consoleErrors.splice(index, 1);
}

test.describe('Customer portfolio — on-site and walk-in registration', () => {
  test('@critical completes email walk-in, sub-event selection, inventory choice, and immediate check-in', async ({ page, diagnostics }) => {
    const state = await open(page);
    await expect(page.getByLabel(/Opening Plenary/)).toBeChecked();
    await expect(page.getByLabel(/QA Workshop/)).toBeChecked();
    await page.getByLabel(/QA Workshop/).uncheck();
    await fillRequired(page);
    await page.getByLabel(/^Company/).fill('Axon QA');
    await page.getByLabel(/^Title/).fill('Developer');
    await page.getByRole('button', { name: 'Submit and Check In' }).click();

    await expect(page.getByText('Registration complete')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Walkin Attendee' })).toBeVisible();
    await expect(page.getByText('Reference #AXN-ONSITE-QA')).toBeVisible();
    expect(state.eventRequests[0].searchParams.get('eventId')).toBe(EVENT_ID);
    expect(state.submissions[0]).toEqual(expect.objectContaining({
      eventId: EVENT_ID,
      tierId: TIER_ID,
      subEventIds: ['session-opening'],
      emailNotApplicable: false,
      email: 'walkin@example.com',
      firstName: 'Walkin',
      lastName: 'Attendee',
      contactNumber: '+639171234567',
      gender: 'prefer_not_to_say',
      birthday: '1995-05-20',
      city: 'Davao City',
      company: 'Axon QA',
      jobTitle: 'Developer',
    }));
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical email-not-applicable walk-in sends no email and creates no customer-account expectation', async ({ page, diagnostics }) => {
    const state = await open(page);
    await page.getByLabel(/^First name/).fill('Noemail');
    await page.getByLabel(/^Last name/).fill('Walkin');
    await page.getByLabel(/Email not applicable/).check();
    await expect(page.getByLabel(/^Email$/)).toBeDisabled();
    await page.getByLabel(/^Contact number/).fill('+639181234567');
    await page.getByLabel('Gender').selectOption('self_described');
    await page.getByLabel(/^Birthday/).fill('1991-01-15');
    await page.getByLabel(/^City/).fill('Tagum City');
    await page.getByRole('button', { name: 'Submit and Check In' }).click();

    await expect(page.getByText('No email provided')).toBeVisible();
    expect(state.submissions[0].emailNotApplicable).toBe(true);
    expect(state.submissions[0]).not.toHaveProperty('email');
    expectNoBrowserFailures(diagnostics);
  });

  test('public name entry never retrieves or exposes a saved customer profile', async ({ page, diagnostics }) => {
    const state = await open(page);
    await page.getByLabel(/^First name/).fill('Known');
    await page.getByLabel(/^Last name/).fill('Customer');
    await page.waitForTimeout(700);
    expect(state.suggestionRequests).toBe(0);
    await expect(page.getByText(/does not create, verify, link, or update an Axon Tickets account/i)).toBeVisible();
    await expect(page.getByText(/saved details found/i)).toHaveCount(0);
    expectNoBrowserFailures(diagnostics);
  });

  test('requires at least one sub-event', async ({ page, diagnostics }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText(/select at least one sub-event/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit and Check In' })).toBeDisabled();
    await page.getByLabel(/Opening Plenary/).check();
    await expect(page.getByRole('button', { name: 'Submit and Check In' })).toBeEnabled();
    expectNoBrowserFailures(diagnostics);
  });

  for (const scenario of [
    { failure: 'duplicate' as const, message: /cannot register twice for the same event/i },
    { failure: 'capacity' as const, message: /No seats are available for this ticket tier/i },
  ]) {
    test(`@critical blocks ${scenario.failure} submissions without a false success`, async ({ page, diagnostics }) => {
      await open(page, { failure: scenario.failure });
      await fillRequired(page);
      await page.getByRole('button', { name: 'Submit and Check In' }).click();
      await expect(page.getByText(scenario.message)).toBeVisible();
      await expect(page.getByText('Registration complete')).toHaveCount(0);
      allowExpected400(diagnostics);
      expectNoBrowserFailures(diagnostics);
    });
  }

  test('disabled and non-sale events never expose registration controls', async ({ page, diagnostics }) => {
    await open(page, { enabled: false });
    await expect(page.getByText('On-site registration is not enabled.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit and Check In' })).toHaveCount(0);
    await page.unroute(API_PATTERN);
    await installApi(page, { status: 'draft' });
    await page.reload();
    await expect(page.getByText('Registration is not open right now.')).toBeVisible();
    await expect(page.getByText(/currently draft/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit and Check In' })).toHaveCount(0);
    expectNoBrowserFailures(diagnostics);
  });
});
