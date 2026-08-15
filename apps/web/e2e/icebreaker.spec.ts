import { test, expect } from './support/admin-test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  HAS_ADMIN_CREDENTIALS,
} from './support/admin-auth';
import type { Page } from '@playwright/test';

async function gotoAdmin(page: Page, path: string) {
  await page.goto(path);

  const logoutButton = page.getByRole('button', { name: 'Log out' });
  const signInHeading = page.getByRole('heading', { name: 'Admin sign-in' });
  await expect(logoutButton.or(signInHeading)).toBeVisible();
  if (await logoutButton.isVisible()) return;

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

  await page.evaluate(
    ({ name, value }) => localStorage.setItem(name, value),
    { name: 'axon_tickets_rt', value: refreshToken },
  );
  await page.goto(path);
  await expect(logoutButton).toBeVisible();
}

test.describe('Icebreaker tab', () => {
  test.skip(!HAS_ADMIN_CREDENTIALS, 'Admin credentials not configured');

  test('navigates to icebreaker tab and renders the wheel', async ({ page }) => {
    // Go to admin events list to find an event
    await gotoAdmin(page, '/admin/events');

    // Click the first event link in the list
    const eventLink = page.locator('a[href*="/admin/events/"]').first();
    await expect(eventLink).toBeVisible({ timeout: 10_000 });
    await eventLink.click();

    // Click the Icebreaker tab
    const icebreakerTab = page.getByRole('link', { name: 'Icebreaker' });
    await expect(icebreakerTab).toBeVisible();
    await icebreakerTab.click();

    // Verify we're on the icebreaker page
    await expect(page).toHaveURL(/\/icebreaker$/);

    // Verify the heading is visible
    await expect(page.getByRole('heading', { name: 'Icebreaker' })).toBeVisible();

    // Verify mode switcher is present with Wheel and Raffle buttons
    await expect(page.getByRole('button', { name: 'Wheel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Raffle' })).toBeVisible();

    // Verify the spin button is present (wheel mode is default)
    await expect(
      page.getByRole('button', { name: /spin the wheel/i }),
    ).toBeVisible();
  });

  test('switches between wheel and raffle modes', async ({ page }) => {
    await gotoAdmin(page, '/admin/events');

    const eventLink = page.locator('a[href*="/admin/events/"]').first();
    await expect(eventLink).toBeVisible({ timeout: 10_000 });
    await eventLink.click();

    const icebreakerTab = page.getByRole('link', { name: 'Icebreaker' });
    await icebreakerTab.click();
    await expect(page).toHaveURL(/\/icebreaker$/);

    // Default is wheel mode
    await expect(
      page.getByRole('button', { name: /spin the wheel/i }),
    ).toBeVisible();

    // Switch to raffle mode
    await page.getByRole('button', { name: 'Raffle' }).click();
    await expect(
      page.getByRole('button', { name: /draw winners/i }),
    ).toBeVisible();

    // Switch back to wheel
    await page.getByRole('button', { name: 'Wheel' }).click();
    await expect(
      page.getByRole('button', { name: /spin the wheel/i }),
    ).toBeVisible();
  });

  test('icebreaker tab appears in event detail navigation', async ({ page }) => {
    await gotoAdmin(page, '/admin/events');

    const eventLink = page.locator('a[href*="/admin/events/"]').first();
    await expect(eventLink).toBeVisible({ timeout: 10_000 });
    await eventLink.click();

    // All three tabs should be visible in the nav
    const nav = page.getByRole('navigation', { name: 'Event sections' });
    await expect(nav.getByText('Edit Event')).toBeVisible();
    await expect(nav.getByText('Workspace')).toBeVisible();
    await expect(nav.getByText('Icebreaker')).toBeVisible();
  });
});
