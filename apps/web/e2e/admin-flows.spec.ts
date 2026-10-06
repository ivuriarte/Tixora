import { test, expect } from './support/admin-test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  HAS_ADMIN_CREDENTIALS,
  IS_ADMIN_MOCKED,
} from './support/admin-auth';
import { mockEventBody } from './support/admin-mocks';
import { emptyDraft, type EventDraft } from '../src/components/event-wizard/types';
import type { Page } from '@playwright/test';

const EVENT_DRAFT_KEY = 'tixora:event-wizard:draft:v1';

async function gotoAdmin(page: Page, path: string) {
  await page.goto(path);

  const logoutButton = page.getByRole('button', { name: 'Log out' });
  const signInHeading = page.getByRole('heading', { name: 'Admin sign-in' });
  await expect(logoutButton.or(signInHeading)).toBeVisible();
  if (await logoutButton.isVisible()) return;

  expect(
    IS_ADMIN_MOCKED,
    'The deterministic admin session should hydrate without contacting a real login endpoint.',
  ).toBe(false);

  const response = await fetch('https://api-uat.axontickets.online/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://uat.axontickets.online',
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload?.data?.user?.isAdmin).toBe(true);
  const refreshToken = payload?.data?.refreshToken;
  expect(typeof refreshToken).toBe('string');

  await page.evaluate(({ name, value }) => localStorage.setItem(name, value), {
    name: 'axon_tickets_rt',
    value: refreshToken,
  });
  await page.goto(path);
  await expect(logoutButton).toBeVisible();
}

async function openCreateWizardStep(
  page: Page,
  step: 'basics' | 'location' | 'details' | 'payment',
  draftOverrides: Partial<EventDraft> = {},
) {
  const isPaidPaymentStep = step === 'payment';
  const persisted = {
    draft: {
      ...emptyDraft(),
      title: 'QA Draft Event',
      description: 'A local-only Playwright draft used to verify the event wizard.',
      imageUrl: '/og-image.png',
      venue: 'QA Convention Hall',
      address: '123 QA Street',
      city: 'Davao City',
      startDate: '2030-01-10',
      startTime: '10:00',
      endDate: '2030-01-10',
      endTime: '12:00',
      maxCapacity: '10',
      isFree: !isPaidPaymentStep,
      ...draftOverrides,
    },
    tiers: [
      {
        key: 1,
        name: 'General Admission',
        description: '',
        price: isPaidPaymentStep ? '1000' : '0',
        totalQuantity: '10',
        maxPerOrder: '2',
        isVisible: true,
        inclusions: [],
        sortOrder: 0,
      },
    ],
    paymentMethods: [],
    savedAt: Date.now(),
  };

  if (page.url() === 'about:blank') {
    await gotoAdmin(page, '/admin');
  }
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: EVENT_DRAFT_KEY,
    value: persisted,
  });
  await gotoAdmin(page, '/admin/events/new');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();

  const advances = step === 'basics' ? 0 : step === 'location' ? 1 : step === 'details' ? 3 : 4;
  for (let index = 0; index < advances; index += 1) {
    await page.getByRole('button', { name: 'Next →', exact: true }).click();
  }
}

async function advanceWizard(page: Page, count: number) {
  for (let index = 0; index < count; index += 1) {
    await page.getByRole('button', { name: 'Next →', exact: true }).click();
  }
}

/**
 * Admin dashboard tests reuse the authenticated state created by admin.setup.ts.
 * Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for the isolated UAT admin identity.
 */

test.describe('Admin Dashboard', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');

  test('admin can view dashboard with event list', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin');
    await expect(page.getByRole('heading', { name: 'Operations Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: /new event/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /guest check-in/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /transactions/i })).toBeVisible();
  });

  test('admin can navigate to orders page', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/orders');
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
  });

  test('admin orders page has status filter', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/orders');
    const statusSelect = page.locator('select').nth(1);
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption('paid');
    await expect(statusSelect).toHaveValue('paid');
  });

  test('admin can navigate to create event page', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/events/new');
    await expect(page.getByRole('heading', { name: /new event/i })).toBeVisible();
  });

  test('admin check-in page loads scanner UI', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/checkin');
    // Should show some scanner UI
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
  });
});

// ── Admin Create Event — Form Fields (regression for recent changes) ─────────

test.describe('Admin Create Event — Form Fields', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');

  test('basics step renders its required fields', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'basics');
    await expect(page.getByPlaceholder(/my awesome concert/i)).toBeVisible();
    await expect(page.getByPlaceholder(/describe your event/i)).toBeVisible();
    await expect(page.getByRole('combobox', { name: /category/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /event format/i })).toBeVisible();
  });

  test('location step has separate date and time controls', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'location');
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible();
    await expect(dateInputs).toHaveCount(2);
    await expect(page.locator('select')).toHaveCount(6);
  });

  test('location step has address field', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'location');
    await expect(page.getByPlaceholder(/jp laurel ave/i)).toBeVisible();
  });

  test('incomplete basics can move on and list what is still needed', async ({ adminPage: page }) => {
    await page.evaluate((key) => localStorage.removeItem(key), EVENT_DRAFT_KEY);
    await gotoAdmin(page, '/admin/events/new');
    await page.getByPlaceholder(/my awesome concert/i).fill('QA Partial Event');
    await page.getByRole('button', { name: 'Next →', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Location & Schedule' })).toBeVisible();
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page.getByText('Still needed before publishing:')).toBeVisible();
    await expect(page.getByText('Description is required')).toBeVisible();
    await expect(page).toHaveURL(/events\/new/);
  });

  test('end-before-start shows banner warning', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'location');
    const dateInputs = page.locator('input[type="date"]');
    const timeSelects = page.locator('select');

    await dateInputs.nth(0).fill('2030-01-10');
    await timeSelects.nth(0).selectOption('10');
    await dateInputs.nth(1).fill('2030-01-10');
    await timeSelects.nth(3).selectOption('9');
    await timeSelects.nth(5).selectOption('AM');

    await expect(page.getByText(/end.*before.*start|end.*must be after/i)).toBeVisible();
  });

  test('new events require an end time', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'location', { endDate: '', endTime: '' });
    await expect(page.getByText('Ends At*')).toBeVisible();
    await page.getByRole('button', { name: 'Next →', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Location & Schedule: Needs info' }).first()).toBeAttached();
    await page.getByRole('button', { name: /^Review:/ }).first().click();
    await expect(page.getByText('End date and time are required')).toBeVisible();
  });

  test('end time is pre-filled three hours after the start', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'location', { endDate: '', endTime: '' });
    const timeSelects = page.locator('select');

    await timeSelects.nth(0).selectOption('11');

    await expect(page.locator('input[type="date"]').nth(1)).toHaveValue('2030-01-10');
    await expect(timeSelects.nth(3)).toHaveValue('2');
    await expect(timeSelects.nth(5)).toHaveValue('PM');
    await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeEnabled();
  });

  test('a start date in the past is listed before the event can be created', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'location', { startDate: '2020-01-10', endDate: '2020-01-10' });
    await page.getByRole('button', { name: /^Review:/ }).first().click();
    await expect(page.getByText('Start date and time cannot be in the past')).toBeVisible();
    await page.getByRole('button', { name: 'Create Event' }).click();
    await expect(page.getByRole('heading', { name: 'Location & Schedule' })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'before saving' }),
    ).toContainText('Start date and time cannot be in the past');
  });

  test('Conference Details section renders sponsors manager', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'details');

    // Sponsors section
    await expect(page.getByText(/sponsors/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add sponsor/i })).toBeVisible();
  });

  test('Conference Details section renders FAQ manager', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'details');

    await expect(page.getByText(/faqs|frequently asked/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add faq|add question/i })).toBeVisible();
  });

  test('can add and remove a sponsor entry', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'details');

    await page.getByRole('button', { name: /add sponsor/i }).click();

    // Company Name field should appear (placeholder from ConferenceFields)
    const nameInput = page.getByPlaceholder(/globe business/i).first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill('ACME Corp');

    // Save the sponsor
    await page.getByRole('button', { name: /^add sponsor$/i }).click();

    // Sponsor appears in list
    const sponsorName = page.getByText('ACME Corp', { exact: true });
    await expect(sponsorName.first()).toBeVisible();

    // Delete the sponsor
    await page
      .getByRole('button', { name: /^delete$/i })
      .first()
      .click();

    // Sponsor should be gone
    await expect(sponsorName).toHaveCount(0);
  });

  test('can add and remove a FAQ entry', async ({ adminPage: page }) => {
    await openCreateWizardStep(page, 'details');

    await page.getByRole('button', { name: /add faq/i }).click();

    // Question input (placeholder from FaqForm)
    const questionInput = page.getByPlaceholder(/what is included/i).first();
    await expect(questionInput).toBeVisible();
    await questionInput.fill('What time does it start?');

    // Answer is also required before saving
    const answerInput = page.getByPlaceholder(/full day access/i).first();
    await answerInput.fill('Doors open at 9am.');

    // Save the FAQ
    await page.getByRole('button', { name: /^add faq$/i }).click();

    // FAQ appears in list
    const faqQuestion = page.getByText('What time does it start?', { exact: true });
    await expect(faqQuestion.first()).toBeVisible();

    // Delete the FAQ
    await page
      .getByRole('button', { name: /^delete$/i })
      .first()
      .click();

    // FAQ should be gone
    await expect(faqQuestion).toHaveCount(0);
  });

  test('can add a payment method without uploading an optional QR code', async ({
    adminPage: page,
  }) => {
    await openCreateWizardStep(page, 'payment');

    await expect(page.getByText(/QR Code.*Optional/)).toBeVisible();
    await page.getByPlaceholder(/BPI, BDO/i).fill('BPI');
    await page.getByPlaceholder(/Juan Dela Cruz/i).fill('Axon Events Inc.');
    await page.getByPlaceholder(/1234-5678-90/i).fill('1234-5678-90');

    const addButton = page.getByRole('button', { name: 'Add', exact: true });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    await expect(page.getByText('BPI', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeEnabled();
  });
});

// ── Admin Edit Event — Pre-population Regression ────────────────────────────

test.describe('Admin Edit Event — Pre-population', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');

  test('navigating to an existing event populates the title field', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin');

    // Find first Edit link in the event list
    const editLink = page.getByRole('link', { name: /edit/i }).first();
    await expect
      .poll(() => editLink.count(), { message: 'UAT should provide at least one editable event.' })
      .toBeGreaterThan(0);

    await editLink.click();
    await page.waitForURL(/events\/[^/]+$/, { timeout: 8000 });

    // Title must be pre-populated (not empty)
    const titleInput = page.getByPlaceholder(/my awesome concert/i).first();
    await expect(titleInput).not.toHaveValue('');
  });

  test('edit form address field is rendered', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin');

    const editLink = page.getByRole('link', { name: /edit/i }).first();
    await expect
      .poll(() => editLink.count(), { message: 'UAT should provide at least one editable event.' })
      .toBeGreaterThan(0);

    await editLink.click();
    await page.waitForURL(/events\/[^/]+$/, { timeout: 8000 });

    await advanceWizard(page, 1);
    await expect(page.getByPlaceholder(/jp laurel ave/i)).toBeVisible();
  });

  test('edit form has sponsors and FAQ managers', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin');

    const editLink = page.getByRole('link', { name: /edit/i }).first();
    await expect
      .poll(() => editLink.count(), { message: 'UAT should provide at least one editable event.' })
      .toBeGreaterThan(0);

    await editLink.click();
    await page.waitForURL(/events\/[^/]+$/, { timeout: 8000 });

    await advanceWizard(page, 3);
    await expect(page.getByRole('button', { name: /add sponsor/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add faq|add question/i })).toBeVisible();
  });
});

// ── E-07: Admin Check-in & Analytics (Phase 6 + Phase 7) ────────────────────

test.describe('Admin Check-in', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');

  test('check-in page renders two tabs', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/checkin');
    // /camera/i matches both the tab button and "Start Camera" — use .first()
    await expect(page.getByRole('button', { name: /camera/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /manual/i })).not.toBeVisible();
  });

  test('check-in page has event selector', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/checkin');
    // Event selector is a <select> element
    const eventSelect = page.locator('select').first();
    await expect(eventSelect).toBeVisible();
  });

  test('search tab submits an attendee query successfully', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/checkin');

    // Switch to Search tab
    await page.getByRole('button', { name: /search/i }).click();

    const eventSelect = page.locator('select').first();
    await expect
      .poll(() => eventSelect.locator('option:not([value=""])').count(), {
        message: 'UAT should provide at least one event for check-in search.',
      })
      .toBeGreaterThan(0);
    await eventSelect.selectOption({ index: 1 });

    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test');

    const searchResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/admin/checkin/search?') && response.request().method() === 'GET',
    );
    await page
      .getByRole('button', { name: /^search$/i })
      .last()
      .click();
    expect((await searchResponse).ok()).toBe(true);

    await expect(page.getByText(/something went wrong|unhandled/i)).not.toBeVisible();
  });
});

test.describe('Admin Analytics', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');

  test('analytics page loads and shows stat cards', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/analytics');
    // Page must render at least one heading
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
  });

  test('analytics page has event selector', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/analytics');
    const eventSelect = page.locator('select').first();
    await expect(eventSelect).toBeVisible();
  });

  test('analytics page has time-range toggle buttons (7d, 14d, 30d)', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/analytics');
    await expect(page.getByRole('button', { name: /7d/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /14d/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /30d/i })).toBeVisible();
  });

  test('admin dashboard has Analytics quick-link', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin');
    await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible();
  });
});

test.describe('Admin/Organizer portfolio — on-site operations', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');
  test.skip(
    !IS_ADMIN_MOCKED,
    'Deterministic event fixtures are exercised by the mocked admin portfolio.',
  );

  test('event editor exposes the QR poster and persists the on-site toggle', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/events/event-qa');
    await expect(page.getByText('On-site registration QR')).toBeVisible();
    const download = page.getByRole('link', { name: 'Download QR' });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute(
      'href',
      /events\/qa-event-2030\/onsite-registration\/qr\.pdf\?eventId=event-qa/,
    );

    const requestPromise = page.waitForRequest(
      (request) => request.url().includes('/admin/events/event-qa') && request.method() === 'PUT',
    );
    await page.getByLabel('Enabled').uncheck();
    const request = await requestPromise;
    expect(request.postDataJSON()).toEqual({ onsiteRegistrationEnabled: false });
    await expect(download).toHaveCount(0);
  });

  test('events saved without an end time keep it optional and explain auto-completion', async ({
    adminPage: page,
  }) => {
    await page.route(/\/api\/v1\/admin\/events\/event-qa$/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ contentType: 'application/json', body: mockEventBody({ endsAt: null }) })
        : route.fallback(),
    );
    await gotoAdmin(page, '/admin/events/event-qa');
    await page.getByRole('button', { name: 'Next →', exact: true }).click();

    await expect(page.getByText('Ends At (optional)')).toBeVisible();
    await expect(
      page.getByText('No end time set — this event will be marked completed 24 hours after it starts.'),
    ).toBeVisible();
  });

  test('event history provides the event-scoped on-site QR download', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/events');
    await expect(page.getByText('QA Event 2030', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download QR' }).first()).toHaveAttribute(
      'href',
      /events\/qa-event-2030\/onsite-registration\/qr\.pdf\?eventId=event-qa/,
    );
  });

  test('walk-in registration is visible in the owned event attendee roster', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/attendees?eventId=event-qa');
    await expect(page.getByRole('heading', { name: 'Attendees' })).toBeVisible();
    const attendeeRow = page.getByRole('row', { name: /Walkin Attendee/ });
    await expect(attendeeRow).toContainText('walkin@example.com');
    await expect(attendeeRow).toContainText('Opening Plenary');
    await expect(attendeeRow).toContainText('General Admission');
    await expect(attendeeRow).toContainText('Yes');
    await expect(page.getByText('1 attendee', { exact: true })).toBeVisible();
  });

  test('walk-in attendee is searchable at the check-in desk', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/checkin');
    await page.getByRole('button', { name: /search/i }).click();
    await page.locator('select').first().selectOption('event-qa');
    await page.locator('input[type="text"], input[type="search"]').first().fill('Walkin Attendee');
    await page
      .getByRole('button', { name: /^search$/i })
      .last()
      .click();
    await expect(page.getByText('Walkin Attendee')).toBeVisible();
    await expect(page.getByText(/AXN-ONSITE-QA/)).toBeVisible();
  });

  test('running-event merchandise can be filtered and exported as an aggregate', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/attendees?eventId=event-running-qa');
    await expect(page.getByRole('heading', { name: 'Merchandise claim summary' })).toBeVisible();
    await expect(page.getByRole('row', { name: /5K Open M 1 0 1/ })).toBeVisible();

    await page.getByLabel('Filter merchandise by distance').fill('5K');
    await expect(page.getByRole('row', { name: /5K Open M 1 0 1/ })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export summary' }).click();
    await expect((await download).suggestedFilename()).toBe(
      'merchandise-summary-event-running-qa.csv',
    );
  });

  test('approved runner distance change requires a reason and requests a new bib', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/attendees?eventId=event-running-qa');
    await page.getByRole('button', { name: 'Change distance' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change race distance' });
    await dialog.getByLabel('New distance').selectOption('10K');
    await expect(dialog.getByRole('button', { name: 'Allocate new bib' })).toBeDisabled();
    await dialog.getByLabel('Audit reason').fill('Approved correction requested by the runner.');

    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/attendees/attendee-running-qa/race-distance') &&
        request.method() === 'PATCH',
    );
    await dialog.getByRole('button', { name: 'Allocate new bib' }).click();
    expect((await requestPromise).postDataJSON()).toEqual({
      distance: '10K',
      reason: 'Approved correction requested by the runner.',
    });
  });
});

test.describe('Super Admin portfolio — platform governance', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin test identity is not configured.');
  test.skip(
    !IS_ADMIN_MOCKED,
    'Mutating governance scenarios require deterministic test-only identities.',
  );

  test('super admin can review users and grant a role to another identity', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByText('customer@example.com')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/admin/users/user-qa/role') && request.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Make Admin' }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ isAdmin: true });
    await expect(page.getByText('Admin role granted')).toBeVisible();
  });

  test('super admin can review organizer applications across the platform', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/organizers');
    await expect(page.getByRole('heading', { name: 'Organizer Applications' })).toBeVisible();
    await expect(page.getByText('QA Events', { exact: true })).toBeVisible();
    await expect(page.getByText('owner@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review' })).toBeVisible();
  });

  test('super admin can hide an organizer profile only with an audited reason', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/organizers');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Hide profile' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Hide profile' })).toBeDisabled();
    await dialog.getByPlaceholder(/governance reason/i).fill('Verified policy violation');
    const requestPromise = page.waitForRequest(
      (request) => request.url().includes('/profile-visibility') && request.method() === 'PATCH',
    );
    await dialog.getByRole('button', { name: 'Hide profile' }).click();
    expect((await requestPromise).postDataJSON()).toEqual({
      visible: false,
      reason: 'Verified policy violation',
    });
  });

  test('super admin executive dashboard renders the v2.1 contract and global date range', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/executive-analytics');
    await expect(page.getByRole('heading', { name: 'Executive performance' })).toBeVisible();
    await expect(page.getByLabel('Financial performance').getByText('Gross sales')).toBeVisible();
    await expect(page.getByText('contract v2.1')).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Commercial contribution' })).toBeVisible();
    await expect(page.getByText('QA Events')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export reconciled CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^axon-executive-analytics-.*\.csv$/);
  });

  test('super admin can update the platform-wide service fee with validation', async ({
    adminPage: page,
  }) => {
    await gotoAdmin(page, '/admin/settings/platform');
    await expect(page.getByRole('heading', { name: 'Platform Settings' })).toBeVisible();
    const fee = page.locator('input[type="number"]');
    await expect(fee).toHaveValue('50');
    await fee.fill('75');
    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/admin/settings/platform') && request.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save Changes' }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ serviceFee: 75 });
    await expect(page.getByText('Platform settings saved.')).toBeVisible();
  });
});

test.describe('Admin unpaid checkout holds', () => {
  const holdRegistration = (status: string) => ({
    id: 'reg-hold-1',
    referenceNumber: 'AXN-2026-HOLD1',
    status,
    tierName: 'Balcony',
    attendeeCount: 2,
    subtotal: 1000,
    fees: 50,
    discount: 0,
    total: 1050,
    currency: 'PHP',
    rejectionReason: null,
    verifiedAt: null,
    createdAt: '2026-10-02T04:13:57.000Z',
    paymentMethod: null,
    holdExpiresAt: '2026-10-03T04:13:57.000Z',
    event: {
      title: 'QA Event 2030',
      slug: 'qa-event-2030',
      startsAt: '2030-01-01T01:00:00.000Z',
      venue: 'QA Hall',
      address: null,
      landmark: null,
    },
    user: null,
    attendees: [],
    proofs: [],
    lineItems: [],
    verifiedBy: null,
  });

  async function mockHold(page: Page, release: 'ok' | 'fail') {
    const state = { released: false, releaseCalls: 0 };
    await page.route('**/api/v1/admin/registrations/reg-hold-1**', async (route) => {
      const request = route.request();
      if (request.method() === 'PATCH' && request.url().endsWith('/release-hold')) {
        state.releaseCalls += 1;
        if (release === 'fail') {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'not an unpaid hold' }),
          });
        }
        state.released = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { message: 'Hold released' } }),
        });
      }
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: holdRegistration(state.released ? 'cancelled' : 'pending_payment'),
          }),
        });
      }
      return route.continue();
    });
    return state;
  }

  test('an unfinished checkout is labelled honestly and its hold can be released', async ({ adminPage: page }) => {
    const state = await mockHold(page, 'ok');
    await gotoAdmin(page, '/admin/registrations/reg-hold-1');

    await expect(page.getByText('Checkout started (no details yet)')).toBeVisible();
    await expect(page.getByText('Walk-in attendee')).toHaveCount(0);
    await expect(page.getByText(/Seats held until \w{3}, \w{3} \d{1,2}, \d{4} · /)).toBeVisible();

    await page.getByRole('button', { name: 'Release hold' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Release this hold?');
    await expect(dialog).toContainText('The seats go back on sale right away.');
    await dialog.getByRole('button', { name: 'Release hold' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Hold released. The seats are available again.' })).toBeVisible();
    expect(state.releaseCalls).toBe(1);
    await expect(page.getByRole('button', { name: 'Release hold' })).toHaveCount(0);
  });

  test('keeping the hold releases nothing', async ({ adminPage: page }) => {
    const state = await mockHold(page, 'ok');
    await gotoAdmin(page, '/admin/registrations/reg-hold-1');
    await page.getByRole('button', { name: 'Release hold' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep hold' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.releaseCalls).toBe(0);
  });

  test('a failed release explains what to do next and keeps the hold', async ({ adminPage: page }) => {
    await mockHold(page, 'fail');
    await gotoAdmin(page, '/admin/registrations/reg-hold-1');
    await page.getByRole('button', { name: 'Release hold' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Release hold' }).click();

    await expect(page.getByRole('alert').filter({ hasText: "Couldn't release this hold" })).toBeVisible();
    // Scoped to the page: the dialog is still fading out for a moment after it closes.
    await expect(page.getByRole('main').getByRole('button', { name: 'Release hold' })).toBeVisible();
  });
});

test.describe('Admin seat counts: Sold, Awaiting review, Pending payment', () => {
  test.skip(!IS_ADMIN_MOCKED, 'Uses deterministic mocked seat counts.');

  const listEvent = (overrides: Record<string, unknown>) => ({
    id: 'event-seat',
    slug: 'seat-event',
    title: 'WAIT… this song was on glee: A Cabaret',
    description: 'd',
    venue: "Bern's Theater",
    city: 'Davao',
    startsAt: '2027-02-05T02:00:00.000Z',
    endsAt: '2027-02-07T12:00:00.000Z',
    status: 'on_sale',
    isFree: false,
    onsiteRegistrationEnabled: false,
    organization: null,
    ticketsSold: 0,
    ...overrides,
  });

  async function mockList(page: Page, events: Array<Record<string, unknown>>, mode: 'ok' | 'fail' = 'ok') {
    const handler = async (route: import('@playwright/test').Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      if (mode === 'fail') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { data: events, meta: { total: events.length, page: 1, limit: 100, totalPages: 1 } },
        }),
      });
    };
    await page.route(/\/api\/v1\/admin\/events(\?.*)?$/, handler);
    return async () => page.unroute(/\/api\/v1\/admin\/events(\?.*)?$/, handler);
  }

  test('the dashboard shows each part in admin words and never calls unpaid seats "sold"', async ({ adminPage: page }) => {
    const done = await mockList(page, [
      listEvent({ id: 'e-mixed', ticketsSold: 14, ticketsConfirmed: 5, ticketsAwaitingReview: 2, ticketsHeld: 7 }),
      listEvent({ id: 'e-held', title: 'Only pending', ticketsSold: 7, ticketsConfirmed: 0, ticketsAwaitingReview: 0, ticketsHeld: 7 }),
      listEvent({ id: 'e-none', title: 'Nothing yet', ticketsSold: 0, ticketsConfirmed: 0, ticketsAwaitingReview: 0, ticketsHeld: 0 }),
    ]);
    try {
      await gotoAdmin(page, '/admin');
      const groups = page.getByRole('group', { name: 'Seat counts' });
      await expect(groups).toHaveCount(3);

      await expect(groups.nth(0)).toContainText('5 Sold');
      await expect(groups.nth(0)).toContainText('2 Awaiting review');
      await expect(groups.nth(0)).toContainText('7 Pending payment');

      // Today's screenshot case: nothing paid, seven pending checkouts.
      await expect(groups.nth(1)).toContainText('7 Pending payment');
      await expect(groups.nth(1)).not.toContainText('Sold');
      await expect(groups.nth(2)).toHaveText(/^\s*0 Sold\s*$/);

      // The old wording is gone.
      await expect(page.getByText(/\b7 sold\b/i)).toHaveCount(0);

      // Always-visible legend (no hover needed).
      await expect(page.getByText('What the counts mean')).toBeVisible();
      await expect(page.getByText(/seat held, no proof yet/)).toBeVisible();

      // Link only where something is pending, and it opens Transactions for that event.
      const links = page.getByRole('link', { name: 'View pending checkouts' });
      await expect(links).toHaveCount(2);
      await expect(links.first()).toHaveAttribute('href', '/admin/orders?eventId=e-mixed&status=pending');
      const box = await links.first().boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    } finally {
      await done();
    }
  });

  test('a missing breakdown says "Counts unavailable" instead of showing 0', async ({ adminPage: page }) => {
    const done = await mockList(page, [listEvent({ id: 'e-old', ticketsSold: 9 })]);
    try {
      await gotoAdmin(page, '/admin');
      await expect(page.getByText('Counts unavailable')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Seat counts' })).toHaveCount(0);
    } finally {
      await done();
    }
  });

  test('a failed list load shows an error with Retry', async ({ adminPage: page }) => {
    const done = await mockList(page, [], 'fail');
    try {
      await gotoAdmin(page, '/admin');
      await expect(page.getByRole('alert').filter({ hasText: "Couldn't load the events" })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    } finally {
      await done();
    }
  });

  test('Event History uses the same counts and the row does not scroll sideways at 320 px', async ({ adminPage: page }) => {
    const done = await mockList(page, [
      listEvent({ id: 'e-mixed', ticketsSold: 14, ticketsConfirmed: 5, ticketsAwaitingReview: 2, ticketsHeld: 7 }),
    ]);
    try {
      await page.setViewportSize({ width: 320, height: 800 });
      await gotoAdmin(page, '/admin/events');
      const group = page.getByRole('group', { name: 'Seat counts' });
      await expect(group).toContainText('5 Sold');
      await expect(group).toContainText('7 Pending payment');
      await expect(page.getByText('What the counts mean')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
      await done();
    }
  });

  test('the Transactions deep link preselects the event and the pending filter', async ({ adminPage: page }) => {
    await gotoAdmin(page, '/admin/orders?eventId=event-qa&status=pending');
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();
    await expect(page.locator('select').filter({ has: page.locator('option[value="pending"]') })).toHaveValue('pending');
  });
});

test.describe('Admin tier cards and the capacity guard', () => {
  test.skip(!IS_ADMIN_MOCKED, 'Uses deterministic mocked seat counts.');

  test('the tier card shows the three parts and a refused capacity cut explains itself', async ({ adminPage: page }) => {
    const message =
      "You can't go below 10: 6 sold, 1 awaiting review, 3 pending payment. Wait for pending checkouts to expire, or release them in Transactions.";
    await page.route(/\/api\/v1\/admin\/tiers\/tier-qa$/, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message }),
      });
    });
    await gotoAdmin(page, '/admin/events/event-qa');
    await page.getByRole('button', { name: /Capacity & Tiers/ }).first().click();

    const counts = page.getByRole('group', { name: 'Seat counts' });
    await expect(counts).toContainText('6 Sold');
    await expect(counts).toContainText('1 Awaiting review');
    await expect(counts).toContainText('3 Pending payment');

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByText("Capacity can't be lowered below the seats already reserved.")).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();

    const alert = page.getByRole('alert').filter({ hasText: "You can't go below 10" });
    await expect(alert).toContainText('6 sold, 1 awaiting review, 3 pending payment');
    await expect(alert.getByRole('link', { name: 'View pending checkouts' })).toHaveAttribute(
      'href',
      '/admin/orders?eventId=event-qa&status=pending',
    );
  });
});

test.describe('Admin Review block for an order whose buyer has not finished their details', () => {
  test.skip(!IS_ADMIN_MOCKED, 'Uses a deterministic mocked registration.');

  const registration = (overrides: Record<string, unknown>) => ({
    id: 'reg-unfinished-1',
    referenceNumber: 'AXN-2026-UNFIN',
    status: 'proof_submitted',
    tierName: 'Balcony',
    attendeeCount: 1,
    subtotal: 1000,
    fees: 50,
    discount: 0,
    total: 1050,
    currency: 'PHP',
    rejectionReason: null,
    verifiedAt: null,
    createdAt: '2026-10-02T04:13:57.000Z',
    paymentMethod: null,
    holdExpiresAt: null,
    attendeesCompletedAt: null,
    event: { title: 'QA Event 2030', slug: 'qa-event-2030', startsAt: '2030-01-01T01:00:00.000Z', venue: 'QA Hall', address: null, landmark: null },
    user: { id: 'user-1', email: 'buyer@example.com', firstName: 'Bea', lastName: 'Buyer' },
    attendees: [],
    proofs: [],
    lineItems: [],
    verifiedBy: null,
    ...overrides,
  });

  async function mockRegistration(page: Page, body: Record<string, unknown>) {
    await page.route('**/api/v1/admin/registrations/reg-unfinished-1**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) });
    });
  }

  const lead = {
    id: 'att-1', firstName: 'Bea', lastName: 'Buyer', email: 'buyer@example.com', phone: null,
    company: null, jobTitle: null, isLead: true,
  };

  test('Approve is disabled and explains why; Reject stays available', async ({ adminPage: page }) => {
    await mockRegistration(page, registration({}));
    await gotoAdmin(page, '/admin/registrations/reg-unfinished-1');

    const notice = page.getByRole('status').filter({ hasText: "Waiting for the buyer's details." });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('The payment proof is saved. You can approve once the buyer finishes their details.');
    const approve = page.getByRole('button', { name: 'Approve & Verify' });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAttribute('aria-describedby', 'details-pending-notice');
    await expect(page.locator('#details-pending-notice')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  test('fewer attendee rows than tickets is also unfinished (same test as the server)', async ({ adminPage: page }) => {
    await mockRegistration(page, registration({ attendeeCount: 2, attendees: [lead], attendeesCompletedAt: '2026-10-02T05:00:00.000Z' }));
    await gotoAdmin(page, '/admin/registrations/reg-unfinished-1');
    await expect(page.getByRole('button', { name: 'Approve & Verify' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: "Waiting for the buyer's details." })).toBeVisible();
  });

  test('a complete order is unchanged: Approve is enabled and there is no notice', async ({ adminPage: page }) => {
    await mockRegistration(page, registration({ status: 'pending_approval', attendees: [lead], attendeesCompletedAt: '2026-10-02T05:00:00.000Z' }));
    await gotoAdmin(page, '/admin/registrations/reg-unfinished-1');
    await expect(page.getByRole('button', { name: 'Approve & Verify' })).toBeEnabled();
    await expect(page.getByRole('status').filter({ hasText: "Waiting for the buyer's details." })).toHaveCount(0);
    await expect(page.locator('#details-pending-notice')).toHaveCount(0);
  });

  test('if the response has no attendeesCompletedAt field we cannot tell, so Approve is not blocked (the server still refuses)', async ({ adminPage: page }) => {
    const { attendeesCompletedAt: _omitted, ...withoutField } = registration({});
    await mockRegistration(page, withoutField);
    await gotoAdmin(page, '/admin/registrations/reg-unfinished-1');
    await expect(page.getByRole('button', { name: 'Approve & Verify' })).toBeEnabled();
    await expect(page.locator('#details-pending-notice')).toHaveCount(0);
  });

  test('a finished order (verified) shows no review block and no notice', async ({ adminPage: page }) => {
    await mockRegistration(page, registration({ status: 'verified', attendees: [lead], attendeesCompletedAt: '2026-10-02T05:00:00.000Z' }));
    await gotoAdmin(page, '/admin/registrations/reg-unfinished-1');
    await expect(page.getByRole('heading', { name: 'Review' })).toHaveCount(0);
    await expect(page.locator('#details-pending-notice')).toHaveCount(0);
  });

  test('at 320 px the two buttons keep an equal-width row and nothing scrolls sideways', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await mockRegistration(page, registration({}));
    await gotoAdmin(page, '/admin/registrations/reg-unfinished-1');
    const approve = page.getByRole('button', { name: 'Approve & Verify' });
    const reject = page.getByRole('button', { name: 'Reject' });
    await expect(approve).toBeVisible();
    const [a, r] = [(await approve.boundingBox())!, (await reject.boundingBox())!];
    expect(Math.abs(a.width - r.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.y - r.y)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('Admin verification queue: no hidden date filter by default', () => {
  test.skip(!IS_ADMIN_MOCKED, 'Uses deterministic mocked queue data.');

  const OLD_ROW = {
    id: 'reg-old-1',
    referenceNumber: 'AXN-2026-QUEUE1',
    status: 'pending_approval',
    tierName: 'General Admission',
    attendeeCount: 1,
    total: 1050,
    currency: 'PHP',
    eventTitle: 'QA Queue Event',
    eventSlug: 'qa-queue-event',
    leadName: 'Bea Buyer',
    leadEmail: 'buyer@example.com',
    hasProof: true,
    proofStatus: 'pending',
    // Created three days ago: the old default (today only) hid exactly this kind of row.
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  };

  async function mockQueue(page: Page, rows: Array<typeof OLD_ROW>) {
    const requests: URL[] = [];
    await page.route('**/api/v1/admin/**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'GET' && url.pathname.endsWith('/admin/events')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'event-queue', title: 'QA Queue Event' }] }) });
      }
      if (route.request().method() === 'GET' && url.pathname.endsWith('/admin/verifications')) {
        requests.push(url);
        const from = url.searchParams.get('dateFrom');
        const shown = from ? rows.filter((r) => r.createdAt.slice(0, 10) >= from) : rows;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { data: shown, meta: { total: shown.length, page: 1, limit: 50, totalPages: 1 } } }),
        });
      }
      return route.fallback();
    });
    return requests;
  }

  test('an order from an earlier day is listed, and no date filter is sent', async ({ adminPage: page }) => {
    const requests = await mockQueue(page, [OLD_ROW]);
    await gotoAdmin(page, '/admin/verifications');
    await page.getByLabel('Event').selectOption('event-queue');

    await expect(page.getByText('AXN-2026-QUEUE1')).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    const first = requests[0];
    expect(first.searchParams.get('status')).toBe('pending_approval');
    expect(first.searchParams.get('dateFrom')).toBeNull();
    expect(first.searchParams.get('dateTo')).toBeNull();
    await expect(page.getByLabel('Date From')).toHaveValue('');
    await expect(page.getByLabel('Date To')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Clear dates' })).toHaveCount(0);
  });

  test('choosing a date still filters, and Clear dates brings everything back', async ({ adminPage: page }) => {
    const requests = await mockQueue(page, [OLD_ROW]);
    await gotoAdmin(page, '/admin/verifications');
    await page.getByLabel('Event').selectOption('event-queue');
    await expect(page.getByText('AXN-2026-QUEUE1')).toBeVisible();

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel('Date From').fill(tomorrow);
    await expect(page.getByText('No matching transactions')).toBeVisible();
    await expect(page.getByText('Use "Clear dates" to see every transaction for this event')).toBeVisible();
    expect(requests[requests.length - 1].searchParams.get('dateFrom')).toBe(tomorrow);

    await page.getByRole('button', { name: 'Clear dates' }).click();
    await expect(page.getByText('AXN-2026-QUEUE1')).toBeVisible();
    expect(requests[requests.length - 1].searchParams.get('dateFrom')).toBeNull();
  });
});
