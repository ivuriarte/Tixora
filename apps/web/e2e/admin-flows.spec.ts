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
    await expect(page.getByRole('heading', { name: /create.*event/i })).toBeVisible();
  });

  test('admin check-in page loads scanner UI', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/checkin');
    // Should show some scanner UI
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
  });
});
