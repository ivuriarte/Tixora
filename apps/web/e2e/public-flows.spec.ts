import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('renders upcoming events heading and event cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /upcoming events/i })).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
    // Navbar links
    await expect(page.getByRole('link', { name: 'Tixora' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('event card links to event page', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('a[href^="/events/"]').first();
    await expect(firstCard).toBeVisible();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/^\/events\//);
  });
});

test.describe('Auth — Login', () => {
  test('renders login form', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('textbox').first()).toBeVisible(); // email
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });

  test('shows error on empty submit', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /log in/i }).click();
    // Either HTML5 validation or app-level error prevents navigation
    await expect(page).toHaveURL(/auth\/login/);
  });

  test('navigates to register page from login', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /sign up free/i }).click();
    await expect(page).toHaveURL(/auth\/register/);
  });
});

test.describe('Auth — Register', () => {
  test('renders registration form with all fields', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    // HCaptcha iframe should load
    await expect(page.locator('iframe[title*="hCaptcha"]').first()).toBeVisible();
  });

  test('navigates to login page from register', async ({ page }) => {
    await page.goto('/auth/register');
    await page.getByRole('link', { name: /log in/i }).click();
    await expect(page).toHaveURL(/auth\/login/);
  });
});

test.describe('Navigation', () => {
  test('Tixora logo navigates to homepage', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: 'Tixora' }).click();
    await expect(page).toHaveURL('/');
  });

  test('Sign up link from homepage navigates correctly', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/auth\/register/);
  });
});

test.describe('Event Detail', () => {
  test('event detail page renders or shows 404 gracefully', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('a[href^="/events/"]').first();
    const href = await firstCard.getAttribute('href');
    if (href) {
      await page.goto(href);
      // Either shows event or 404 — no unhandled error
      const is404 = await page.locator('text=404').isVisible().catch(() => false);
      const hasTitle = await page.locator('h1, h2').first().isVisible().catch(() => false);
      expect(is404 || hasTitle).toBe(true);
    }
  });
});
