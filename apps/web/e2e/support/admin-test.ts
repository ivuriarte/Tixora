import { expect, test as base, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE, IS_ADMIN_MOCKED } from './admin-auth';
import { installAdminApiMocks } from './admin-mocks';

/**
 * UAT rotates refresh tokens during hydration. Reusing one worker-scoped
 * context preserves the latest rotated token while keeping all 24 scenarios
 * independently reported by Playwright.
 */
export const test = base.extend<{}, { adminPage: Page }>({
  adminPage: [
    async ({ browser }, use) => {
      const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
      const context = await browser.newContext({
        baseURL,
        storageState: IS_ADMIN_MOCKED
          ? {
              cookies: [],
              origins: [
                {
                  origin: new URL(baseURL).origin,
                  localStorage: [
                    { name: 'axon_tickets_rt', value: 'qa-refresh-token' },
                    { name: 'axon_tickets_portal', value: 'organizer' },
                  ],
                },
              ],
            }
          : ADMIN_STORAGE_STATE,
        ...(bypassSecret
          ? {
              extraHTTPHeaders: {
                'x-vercel-protection-bypass': bypassSecret,
                'x-vercel-set-bypass-cookie': 'true',
              },
            }
          : {}),
      });

      if (IS_ADMIN_MOCKED) await installAdminApiMocks(context);

      // Vercel's bypass headers belong only to the protected web deployment.
      // Sending them to the separate API origin forces an unnecessary CORS
      // preflight and prevents AuthHydrator from restoring the admin session.
      if (!IS_ADMIN_MOCKED && bypassSecret && process.env.API_URL) {
        const apiOrigin = new URL(process.env.API_URL).origin;
        await context.route(`${apiOrigin}/**`, async (route) => {
          const headers = { ...route.request().headers() };
          delete headers['x-vercel-protection-bypass'];
          delete headers['x-vercel-set-bypass-cookie'];
          await route.continue({ headers });
        });
      }

      const page = await context.newPage();

      await use(page);

      await context.close();
    },
    { scope: 'worker' },
  ],
});

export { expect };
