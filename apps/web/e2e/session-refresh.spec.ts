import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { installAdminApiMocks } from './support/admin-mocks';

/**
 * Mirrors the API's refresh-token rules: each refresh token is single-use (revoked on
 * rotation) and access tokens stop working when they expire. Everything else falls
 * through to the shared admin mocks.
 */
class FakeAuthServer {
  private counter = 0;
  readonly validRefresh = new Set<string>(['seed-refresh-token']);
  readonly validAccess = new Set<string>();
  refreshCalls = 0;
  rejectedRefreshCalls = 0;
  unreachable = false;
  private meGate: Promise<void> | null = null;
  private openMeGate: (() => void) | null = null;

  holdNextMe() {
    this.meGate = new Promise((resolve) => {
      this.openMeGate = resolve;
    });
  }

  releaseMe() {
    this.openMeGate?.();
  }

  expireAccessTokens() {
    this.validAccess.clear();
  }

  revokeAll() {
    this.validRefresh.clear();
    this.validAccess.clear();
  }

  issue() {
    this.counter += 1;
    const tokens = { accessToken: `access-${this.counter}`, refreshToken: `refresh-${this.counter}` };
    this.validAccess.add(tokens.accessToken);
    this.validRefresh.add(tokens.refreshToken);
    return tokens;
  }

  async install(context: BrowserContext) {
    await installAdminApiMocks(context);
    await context.route(/\/api\/v1\/.*/, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, '');
      const method = request.method();

      if (method === 'OPTIONS') return route.fallback();
      if (this.unreachable) return route.abort('internetdisconnected');

      if (method === 'POST' && path === '/auth/refresh') {
        this.refreshCalls += 1;
        const { refreshToken } = request.postDataJSON() as { refreshToken?: string };
        if (!refreshToken || !this.validRefresh.delete(refreshToken)) {
          this.rejectedRefreshCalls += 1;
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'Refresh token revoked or expired' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: this.issue() }),
        });
      }

      if (method === 'POST' && path === '/auth/login') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              user: { id: 'qa-admin', email: 'qa-admin@example.com', firstName: 'QA', lastName: 'Admin', isAdmin: true, isVerified: true },
              ...this.issue(),
            },
          }),
        });
      }

      if (method === 'GET' && path === '/auth/me' && this.meGate) {
        const gate = this.meGate;
        this.meGate = null;
        await gate;
      }

      const auth = request.headers()['authorization'] ?? '';
      if (!this.validAccess.has(auth.replace(/^Bearer /, ''))) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Unauthorized' }),
        });
      }
      return route.fallback();
    });
  }
}

async function newAdminContext(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  server: FakeAuthServer,
  portal?: 'customer' | 'organizer',
) {
  const localStorage = [{ name: 'axon_tickets_rt', value: 'seed-refresh-token' }];
  if (portal) localStorage.push({ name: 'axon_tickets_portal', value: portal });
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage }] },
  });
  await server.install(context);
  return context;
}

async function expectSignedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  expect(new URL(page.url()).pathname.startsWith('/auth')).toBe(false);
}

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';

test.describe('Admin session refresh', () => {
  test('stays signed in across repeated access-token expiries', async ({ browser }) => {
    const server = new FakeAuthServer();
    const context = await newAdminContext(browser, baseURL, server);
    const page = await context.newPage();

    await page.goto('/admin/events/new');
    await expectSignedIn(page);

    // The new-event page fetches platform settings on every mount, so each cycle forces a 401 → refresh.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.getByRole('link', { name: 'Events', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Event History' })).toBeVisible();

      server.expireAccessTokens();
      const settingsLoaded = page.waitForResponse((r) => r.url().includes('/admin/settings/platform') && r.status() === 200);
      await page.getByRole('link', { name: '+ New Event' }).click();
      await settingsLoaded;
      await expectSignedIn(page);
    }

    expect(server.rejectedRefreshCalls).toBe(0);
    expect(server.refreshCalls).toBeGreaterThanOrEqual(4);
    await context.close();
  });

  test('two tabs refreshing at the same time both stay signed in', async ({ browser }) => {
    const server = new FakeAuthServer();
    const context = await newAdminContext(browser, baseURL, server);
    const tabA = await context.newPage();
    await tabA.goto('/admin/events/new');
    await expectSignedIn(tabA);
    const tabB = await context.newPage();
    await tabB.goto('/admin/events/new');
    await expectSignedIn(tabB);

    server.expireAccessTokens();
    await Promise.all([
      tabA.getByRole('link', { name: 'Events', exact: true }).click(),
      tabB.getByRole('link', { name: 'Events', exact: true }).click(),
    ]);
    await expect(tabA.getByRole('heading', { name: 'Event History' })).toBeVisible();
    await expect(tabB.getByRole('heading', { name: 'Event History' })).toBeVisible();
    await expectSignedIn(tabA);
    await expectSignedIn(tabB);
    expect(server.rejectedRefreshCalls).toBe(0);

    await tabA.reload();
    await expectSignedIn(tabA);
    expect(server.rejectedRefreshCalls).toBe(0);
    await context.close();
  });

  test('a tab finishing sign-in restore late does not overwrite a newer refresh token', async ({ browser }) => {
    const server = new FakeAuthServer();
    const context = await newAdminContext(browser, baseURL, server);
    const tabA = await context.newPage();
    server.holdNextMe();
    const meRequested = tabA.waitForRequest((r) => r.url().includes('/auth/me'));
    await tabA.goto('/admin/events/new');
    await meRequested;

    const tabB = await context.newPage();
    await tabB.goto('/admin/events/new');
    await expectSignedIn(tabB);

    server.releaseMe();
    await expectSignedIn(tabA);

    server.expireAccessTokens();
    await tabB.reload();
    await expectSignedIn(tabB);
    expect(server.rejectedRefreshCalls).toBe(0);
    await context.close();
  });

  test('an admin who signed in with an email code returns to the email-code sign-in', async ({ browser }) => {
    const server = new FakeAuthServer();
    const context = await newAdminContext(browser, baseURL, server, 'customer');
    const page = await context.newPage();
    await page.goto('/admin/events/new');
    await expectSignedIn(page);

    server.revokeAll();
    await page.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/access\?redirect=%2Fadmin%2Fevents$/);
    await context.close();
  });

  test('keeps the stored session when the API is unreachable during page load', async ({ browser }) => {
    const server = new FakeAuthServer();
    server.unreachable = true;
    const context = await newAdminContext(browser, baseURL, server);
    const page = await context.newPage();
    await page.goto('/admin/events/new');
    await expect(page).toHaveURL(/\/auth\/admin\?redirect=%2Fadmin%2Fevents%2Fnew$/);
    expect(await page.evaluate(() => localStorage.getItem('axon_tickets_rt'))).toBe('seed-refresh-token');
    await context.close();
  });

  test('a revoked session returns the admin to the same page after signing in', async ({ browser }) => {
    const server = new FakeAuthServer();
    const context = await newAdminContext(browser, baseURL, server);
    const page = await context.newPage();
    await page.goto('/admin/events/new');
    await expectSignedIn(page);

    server.revokeAll();
    await page.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/admin\?redirect=%2Fadmin%2Fevents$/);

    // The form focuses the email field once React has hydrated; typing earlier gets reset.
    await expect(page.locator('#email')).toBeFocused();
    await page.locator('#email').fill('qa-admin@example.com');
    await page.locator('#password').fill('qa-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    await expectSignedIn(page);
    await context.close();
  });

  test('an organizer whose session is revoked goes to the organizer sign-in with a return path', async ({ browser }) => {
    const server = new FakeAuthServer();
    const context = await browser.newContext({
      baseURL,
      storageState: {
        cookies: [],
        origins: [{
          origin: new URL(baseURL).origin,
          localStorage: [
            { name: 'axon_tickets_rt', value: 'seed-refresh-token' },
            { name: 'axon_tickets_portal', value: 'organizer' },
          ],
        }],
      },
    });
    await server.install(context);
    const page = await context.newPage();
    await page.goto('/admin/events/new');
    await expectSignedIn(page);

    server.revokeAll();
    await page.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/organizer\?redirect=%2Fadmin%2Fevents$/);
    await context.close();
  });

  for (const target of ['%2F%2Fevil.example', '%2F%09%2Fevil.example', '%2F%5Cevil.example']) {
    test(`drops the off-site redirect ${target} on the customer sign-in route`, async ({ page }) => {
      await page.goto(`/auth/login?redirect=${target}`);
      await expect(page).toHaveURL(new RegExp(`^${new URL(baseURL).origin}/auth/access$`));
    });
  }

  test('ignores off-site redirect targets on the admin sign-in page', async ({ browser }) => {
    const server = new FakeAuthServer();
    server.revokeAll();
    const context = await browser.newContext({ baseURL });
    await server.install(context);
    const page = await context.newPage();
    await page.goto('/auth/admin?redirect=%2F%2Fevil.example%2Fadmin');
    // The form focuses the email field once React has hydrated; typing earlier gets reset.
    await expect(page.locator('#email')).toBeFocused();
    await page.locator('#email').fill('qa-admin@example.com');
    await page.locator('#password').fill('qa-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(new RegExp(`^${new URL(baseURL).origin}/admin$`));
    await context.close();
  });
});
