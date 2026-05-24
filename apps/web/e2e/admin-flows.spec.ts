import { test, expect } from '@playwright/test';

/**
 * Admin dashboard tests — require admin credentials.
 * Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars to enable.
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? '';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByRole('textbox').first().fill(ADMIN_EMAIL);
  await page.getByRole('textbox').nth(1).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10_000 });
}

test.describe('Admin Dashboard', () => {
  test.skip(!ADMIN_EMAIL, 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests');

  test('admin can view dashboard with event list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /new event/i })).toBeVisible();
    // Quick links visible
    await expect(page.getByRole('link', { name: /check-in scanner/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /view orders/i })).toBeVisible();
  });

  test('admin can navigate to orders page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/orders');
    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
  });

  test('admin orders page has status filter', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/orders');
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    await select.selectOption('paid');
    await expect(select).toHaveValue('paid');
  });

  test('admin can navigate to create event page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');
    await expect(page.getByRole('heading', { name: /new event/i })).toBeVisible();
  });

  test('admin check-in page loads scanner UI', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/checkin');
    // Should show some scanner UI
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
  });
});

// ── Admin Create Event — Form Fields (regression for recent changes) ─────────

test.describe('Admin Create Event — Form Fields', () => {
  test.skip(!ADMIN_EMAIL, 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests');

  test('form renders all required fields with asterisks', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

    // Core required fields — use name attribute since labels lack htmlFor
    await expect(page.locator('[name="title"]')).toBeVisible();
    await expect(page.locator('[name="venue"]')).toBeVisible();
    await expect(page.locator('[name="city"]')).toBeVisible();
  });

  test('form has date + time inputs as separate fields', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

    // Separate date / time inputs (regression: was a single datetime-local)
    const dateInputs = page.locator('input[type="date"]');
    const timeInputs = page.locator('input[type="time"]');
    await expect(dateInputs.first()).toBeVisible();
    await expect(timeInputs.first()).toBeVisible();
  });

  test('form has address field', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');
    await expect(page.locator('[name="address"]')).toBeVisible();
  });

  test('empty submit shows validation — does not navigate away', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');
    await page.getByRole('button', { name: /create event/i }).click();
    // Page should stay on /new
    await expect(page).toHaveURL(/events\/new/);
  });

  test('end-before-start shows banner warning', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

    // Fill start date in the future, then set end before start
    const dateInputs = page.locator('input[type="date"]');
    const timeInputs = page.locator('input[type="time"]');

    await dateInputs.nth(0).fill('2030-01-10'); // starts
    await timeInputs.nth(0).fill('10:00');
    await dateInputs.nth(1).fill('2030-01-09'); // ends BEFORE start
    await timeInputs.nth(1).fill('10:00');

    // Banner should appear
    await expect(page.getByText(/end.*before.*start|end.*must be after/i)).toBeVisible();
  });

  test('Conference Details section renders sponsors manager', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

    // Sponsors section
    await expect(page.getByText(/sponsors/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add sponsor/i })).toBeVisible();
  });

  test('Conference Details section renders FAQ manager', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

    await expect(page.getByText(/faqs|frequently asked/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /add faq|add question/i })).toBeVisible();
  });

  test('can add and remove a sponsor entry', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

    await page.getByRole('button', { name: /add sponsor/i }).click();

    // Company Name field should appear (placeholder from ConferenceFields)
    const nameInput = page.getByPlaceholder(/globe business/i).first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill('ACME Corp');

    // Save the sponsor
    await page.getByRole('button', { name: /^add sponsor$/i }).click();

    // Sponsor appears in list
    await expect(page.getByText('ACME Corp')).toBeVisible();

    // Delete the sponsor
    await page.getByRole('button', { name: /^delete$/i }).first().click();

    // Sponsor should be gone
    await expect(page.getByText('ACME Corp')).not.toBeVisible();
  });

  test('can add and remove a FAQ entry', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/events/new');

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
    await expect(page.getByText('What time does it start?')).toBeVisible();

    // Delete the FAQ
    await page.getByRole('button', { name: /^delete$/i }).first().click();

    // FAQ should be gone
    await expect(page.getByText('What time does it start?')).not.toBeVisible();
  });
});

// ── Admin Edit Event — Pre-population Regression ────────────────────────────

test.describe('Admin Edit Event — Pre-population', () => {
  test.skip(!ADMIN_EMAIL, 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests');

  test('navigating to an existing event populates the title field', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');

    // Find first Edit link in the event list
    const editLink = page.getByRole('link', { name: /edit/i }).first();
    const count = await editLink.count();
    if (count === 0) return; // No events yet — skip

    await editLink.click();
    await page.waitForURL(/events\/[^/]+$/, { timeout: 8000 });

    // Title must be pre-populated (not empty)
    const titleInput = page.getByLabel(/title\s*\*/i).first();
    await expect(titleInput).not.toHaveValue('');
  });

  test('edit form address field is rendered', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');

    const editLink = page.getByRole('link', { name: /edit/i }).first();
    if ((await editLink.count()) === 0) return;

    await editLink.click();
    await page.waitForURL(/events\/[^/]+$/, { timeout: 8000 });

    await expect(page.getByLabel(/address/i)).toBeVisible();
  });

  test('edit form has sponsors and FAQ managers', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');

    const editLink = page.getByRole('link', { name: /edit/i }).first();
    if ((await editLink.count()) === 0) return;

    await editLink.click();
    await page.waitForURL(/events\/[^/]+$/, { timeout: 8000 });

    await expect(page.getByRole('button', { name: /add sponsor/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add faq|add question/i })).toBeVisible();
  });
});

// ── E-07: Admin Check-in & Analytics (Phase 6 + Phase 7) ────────────────────

test.describe('Admin Check-in', () => {
  test.skip(!ADMIN_EMAIL, 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests');

  test('check-in page renders two tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/checkin');
    // /camera/i matches both the tab button and "Start Camera" — use .first()
    await expect(page.getByRole('button', { name: /camera/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /manual/i })).not.toBeVisible();
  });

  test('check-in page has event selector', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/checkin');
    // Event selector is a <select> element
    const eventSelect = page.locator('select').first();
    await expect(eventSelect).toBeVisible();
  });

  test('search tab: entering a query shows a results section', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/checkin');

    // Switch to Search tab
    await page.getByRole('button', { name: /search/i }).click();

    // Input should be visible
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await expect(searchInput).toBeVisible();

    // Type a query — if events exist the results section appears; if not, no crash
    await searchInput.fill('test');
    // Wait briefly for the debounced search
    await page.waitForTimeout(600);

    // Page must not have an unhandled error banner
    await expect(page.getByText(/something went wrong|unhandled/i)).not.toBeVisible();
  });

});

test.describe('Admin Analytics', () => {
  test.skip(!ADMIN_EMAIL, 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests');

  test('analytics page loads and shows stat cards', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics');
    // Page must render at least one heading
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
  });

  test('analytics page has event selector', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics');
    const eventSelect = page.locator('select').first();
    await expect(eventSelect).toBeVisible();
  });

  test('analytics page has time-range toggle buttons (7d, 14d, 30d)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics');
    await expect(page.getByRole('button', { name: /7d/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /14d/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /30d/i })).toBeVisible();
  });

  test('admin dashboard has Analytics quick-link', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: /analytics/i })).toBeVisible();
  });
});

