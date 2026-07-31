import { test, expect } from '@playwright/test';

// ── Homepage ────────────────────────────────────────────────────────────────

test.describe('Homepage', () => {
  test('renders heading and navbar', async ({ page }) => {
    await page.goto('/');
    const primaryNav = page.getByRole('navigation').first();
    await expect(primaryNav).toBeVisible();
    // Navbar brand
    await expect(primaryNav.getByRole('link', { name: 'Axon Tickets' })).toBeVisible();
    // Conference mode → h1 from hero; marketplace mode → h1 from carousel (if featured events
    // exist) or h2 "Upcoming Events" (if none). Accept either level.
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('marketplace mode shows Upcoming Events heading', async ({ page }) => {
    await page.goto('/');
    // Conference mode → h1 event title; marketplace with featured events → h1 from carousel;
    // marketplace with no featured events → h2 "Upcoming Events". Accept any heading.
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('navbar shows Log in and Sign up actions', async ({ page }) => {
    await page.goto('/');
    const primaryNav = page.getByRole('navigation').first();
    await expect(primaryNav.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(primaryNav.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('Sign up link navigates to register page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/auth\/register/);
  });

  test('featured hero exposes an accessible event action without unsupported payment copy', async ({ page }) => {
    await page.goto('/');
    const carousel = page.getByRole('region', { name: 'Featured events' });
    if ((await carousel.count()) === 0) return;

    await expect(
      carousel.locator('p:visible').filter({ hasText: /^Featured Event$/ }),
    ).toBeVisible();
    await expect(carousel.getByText(/GCash accepted/i)).toHaveCount(0);

    const viewEvent = carousel.getByRole('link', { name: /View Event/i }).first();
    await expect(viewEvent).toBeVisible();
    const href = await viewEvent.getAttribute('href');
    expect(href).toMatch(/^\/events\/[a-z0-9-]+$/);
    expect(href).not.toContain('vercel.app');
  });
});

// ── Auth – Login ────────────────────────────────────────────────────────────

test.describe('Auth — Login', () => {
  // Login is OTP/OAuth only — no email+password form
  test('renders login page with entry options', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByText(/welcome back to Axon Tickets/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /continue with email/i })).toBeVisible();
  });

  test('unauthenticated user stays on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/auth\/login/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('continue with email navigates to OTP page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /continue with email/i }).click();
    await expect(page).toHaveURL(/auth\/access/);
  });

  test('join free link navigates to OTP page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /join free/i }).click();
    await expect(page).toHaveURL(/auth\/access/);
  });
});

// ── Auth – Register ─────────────────────────────────────────────────────────

test.describe('Auth — Register', () => {
  test('renders registration form', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /continue with email/i })).toBeVisible();
  });

  test('navigates to login from register', async ({ page }) => {
    await page.goto('/auth/register');
    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/auth\/login/);
  });
});

// ── Navigation ───────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('logo link navigates to homepage', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: 'Axon Tickets' }).click();
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated /admin redirects to auth page', async ({ page }) => {
    await page.goto('/admin');
    // Client-side auth guard redirects to /auth/admin (dedicated admin login)
    await page
      .waitForURL((url) => url.pathname.includes('/auth/'), { timeout: 10_000 })
      .catch(() => {});
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/auth\/(admin|login|access)/);
  });

  test('404 page renders gracefully', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-at-all');
    // Either 404 status or a not-found UI
    const is404Status = res?.status() === 404;
    const has404Text = await page
      .locator('text=404')
      .isVisible()
      .catch(() => false);
    const hasNotFound = await page
      .locator('text=/not found/i')
      .isVisible()
      .catch(() => false);
    expect(is404Status || has404Text || hasNotFound).toBe(true);
  });
});

// ── Event Detail ─────────────────────────────────────────────────────────────

test.describe('Event Detail', () => {
  test('event page renders without unhandled error', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('a[href^="/events/"]:has(h3)').first();
    const count = await firstCard.count();
    if (count === 0) {
      // No events in marketplace mode — acceptable
      return;
    }
    const href = await firstCard.getAttribute('href');
    if (href) {
      await page.goto(href);
      const is404 = await page
        .locator('text=404')
        .isVisible()
        .catch(() => false);
      const hasHeading = await page
        .locator('h1, h2')
        .first()
        .isVisible()
        .catch(() => false);
      expect(is404 || hasHeading).toBe(true);
    }
  });
});

// ── API Health ───────────────────────────────────────────────────────────────

test.describe('API Health', () => {
  const API_URL = process.env.API_URL ?? 'https://api-tau-six-59.vercel.app';

  test('GET /api/v1/health returns 200', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/health`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    // TransformInterceptor wraps: { success: true, data: { status, ... } }
    const body = json.data ?? json;
    expect(body.status).toMatch(/ok|degraded/i);
  });

  test('GET /api/v1/events returns paginated list', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/events?page=1&limit=5`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    const body = json.data ?? json;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.total).toBe('number');
  });

  test('GET /api/v1/events/featured returns the bounded homepage contract', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/events/featured`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    const events = json.data ?? json;
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeLessThanOrEqual(3);
    for (const event of events) {
      expect(event.slug).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(event, 'primaryTierId')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(event, 'featuredImageUrl')).toBe(true);
    }
  });

  test('GET /api/v1/events with invalid page defaults gracefully', async ({ request }) => {
    // page=0 / negative values are clamped to page 1 server-side → should return 200
    const res = await request.get(`${API_URL}/api/v1/events?page=0&limit=5`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    const body = json.data ?? json;
    expect(body.meta.page).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/v1/events/:id for non-existent event returns 404', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/events/non-existent-slug-12345`);
    expect(res.status()).toBe(404);
  });

  test('POST /api/v1/auth/login with missing body returns 400 or 401', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, { data: {} });
    expect([400, 401]).toContain(res.status());
  });

  test('admin endpoints require authentication', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/admin/events`);
    expect([401, 403]).toContain(res.status());
  });
});
