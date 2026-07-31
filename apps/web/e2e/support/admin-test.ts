import { expect, test as base, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './admin-auth';

/**
 * UAT rotates refresh tokens during hydration. Reusing one worker-scoped
 * context preserves the latest rotated token while keeping all 24 scenarios
 * independently reported by Playwright.
 */
export const test = base.extend<{}, { adminPage: Page }>({
  adminPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3100',
        storageState: ADMIN_STORAGE_STATE,
      });
      const page = await context.newPage();

      await use(page);

      await context.close();
    },
    { scope: 'worker' },
  ],
});

export { expect };
