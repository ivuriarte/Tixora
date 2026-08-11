import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const localUatLaunchOptions =
  process.env.PW_LOCAL_UAT_CORS === '1'
    ? { launchOptions: { args: ['--disable-web-security'] } }
    : {};
const crossBrowserProjects =
  process.env.PW_CROSS_BROWSER === '1'
    ? [
        {
          name: 'firefox',
          testIgnore: [/admin-flows\.spec\.ts/, /customer-flows\.spec\.ts/, /.*\.setup\.ts/],
          use: { ...devices['Desktop Firefox'] },
        },
        {
          name: 'webkit',
          testIgnore: [/admin-flows\.spec\.ts/, /customer-flows\.spec\.ts/, /.*\.setup\.ts/],
          use: { ...devices['Desktop Safari'] },
        },
      ]
    : [];

if (process.env.CI && !process.env.BASE_URL) {
  throw new Error(
    'BASE_URL is required in CI so browser tests cannot target an unintended environment.',
  );
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(bypassSecret
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': bypassSecret,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [/admin-flows\.spec\.ts/, /customer-flows\.spec\.ts/, /.*\.setup\.ts/],
      use: { ...devices['Desktop Chrome'], ...localUatLaunchOptions },
    },
    ...crossBrowserProjects,
    {
      name: 'admin-mocked',
      testMatch: /admin-flows\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
    {
      name: 'admin-setup',
      testMatch: /admin\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...localUatLaunchOptions,
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    {
      name: 'admin',
      testMatch: /admin-(flows|live-lifecycle)\.spec\.ts/,
      dependencies: ['admin-setup'],
      use: {
        ...devices['Desktop Chrome'],
        ...localUatLaunchOptions,
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    {
      name: 'customer-setup',
      testMatch: /customer\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...localUatLaunchOptions,
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    {
      name: 'customer',
      testMatch: /customer-flows\.spec\.ts/,
      dependencies: ['customer-setup'],
      use: {
        ...devices['Desktop Chrome'],
        ...localUatLaunchOptions,
        storageState: 'playwright/.auth/customer.json',
      },
    },
  ],
  webServer:
    process.env.PW_START_SERVER === '1'
      ? {
          command: 'npm run start -- -p 3100',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : undefined,
});
