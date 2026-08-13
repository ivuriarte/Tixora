import { test, expect } from './support/admin-test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  HAS_ADMIN_CREDENTIALS,
  IS_ADMIN_MOCKED,
} from './support/admin-auth';
import { emptyDraft } from '../src/components/event-wizard/types';
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

async function openCreateWizardStep(page: Page, step: 'basics' | 'location' | 'details') {
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
      isFree: true,
    },
    tiers: [
      {
        key: 1,
        name: 'General Admission',
        description: '',
        price: '0',
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

  const advances = step === 'basics' ? 0 : step === 'location' ? 1 : 3;
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

  test('invalid basics cannot advance to the next step', async ({ adminPage: page }) => {
    await page.evaluate((key) => localStorage.removeItem(key), EVENT_DRAFT_KEY);
    await gotoAdmin(page, '/admin/events/new');
    await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();
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
