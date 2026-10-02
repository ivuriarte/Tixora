import { test, expect, type Browser, type Page } from '@playwright/test';
import { installAdminApiMocks, mockEventBody } from './support/admin-mocks';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const EVENT_URL = /\/api\/v1\/admin\/events\/event-qa$/;

async function adminPage(browser: Browser, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    viewport,
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'axon_tickets_rt', value: 'qa-refresh-token' }] }],
    },
  });
  await installAdminApiMocks(context);
  return context.newPage();
}

async function serveEvent(page: Page, overrides: Record<string, unknown>) {
  await page.route(EVENT_URL, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: mockEventBody(overrides) })
      : route.fallback(),
  );
}

test.describe('Event setup: open any step', () => {
  test('a new event can jump straight to any step and lists what is missing', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto('/admin/events/new');
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Payment: Not started' })).toBeVisible();
    await page.getByRole('button', { name: 'Payment: Not started' }).click();
    await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();

    await page.getByRole('button', { name: /^Review:/ }).click();
    await expect(page.getByRole('heading', { name: /Before creating this event: \d+ things left/ })).toBeVisible();
    await page.getByRole('button', { name: 'Fix: Title is required (Basics)' }).click();
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to events' })).toBeVisible();
    await page.context().close();
  });

  test('on a phone, All steps opens a sheet that jumps to a step', async ({ browser }) => {
    const page = await adminPage(browser, { width: 375, height: 812 });
    await page.goto('/admin/events/new');
    await expect(page.getByRole('navigation', { name: 'Event setup steps' }).getByText('Step 1 of 6')).toBeVisible();
    await expect(page.getByText('1 of 5 steps ready')).toBeVisible();

    const allSteps = page.getByRole('button', { name: 'All steps' });
    expect((await allSteps.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await allSteps.click();
    const sheet = page.getByRole('dialog', { name: 'All steps' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Event Program & Details\s*Optional/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await allSteps.click();
    await sheet.getByRole('button', { name: /Capacity & Tiers/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Capacity & Tiers' })).toBeVisible();
    await page.context().close();
  });
});

test.describe('Event setup: editing an existing event', () => {
  test('a published event offers Save changes on every step and marks edited steps', async ({ browser }) => {
    const page = await adminPage(browser);
    await serveEvent(page, { imageUrl: '/og-image.png' });
    await page.goto('/admin/events/event-qa');
    const title = page.getByPlaceholder(/my awesome concert/i);
    await expect(title).toHaveValue('QA Event 2030');

    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await title.fill('QA Event 2030 (late show)');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next →' }).click();
    await expect(page.getByRole('button', { name: 'Basics: Edited' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

    const put = page.waitForRequest((r) => EVENT_URL.test(r.url()) && r.method() === 'PUT');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const body = (await put).postDataJSON();
    expect(body).toMatchObject({ title: 'QA Event 2030 (late show)' });
    expect(body).not.toHaveProperty('status');
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Basics: Done' })).toBeVisible();
    await page.context().close();
  });

  test('an event that already completed can still be corrected and saved', async ({ browser }) => {
    const page = await adminPage(browser);
    await serveEvent(page, { status: 'completed', imageUrl: '/og-image.png' });
    await page.goto('/admin/events/event-qa');
    await page.getByPlaceholder(/my awesome concert/i).fill('QA Event 2030 (typo fixed)');
    const put = page.waitForRequest((r) => EVENT_URL.test(r.url()) && r.method() === 'PUT');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const body = (await put).postDataJSON();
    expect(body).toMatchObject({ title: 'QA Event 2030 (typo fixed)' });
    expect(body).not.toHaveProperty('status');
    await expect(page.getByText('All changes saved')).toBeVisible();
    await page.context().close();
  });

  test('the on-site registration switch turns back when the save fails', async ({ browser }) => {
    const page = await adminPage(browser);
    await serveEvent(page, { imageUrl: '/og-image.png' });
    await page.route(EVENT_URL, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, statusCode: 500, message: 'Internal server error' }) })
        : route.fallback(),
    );
    await page.goto('/admin/events/event-qa');
    const enabled = page.getByLabel('Enabled');
    await expect(enabled).toBeChecked();
    await enabled.uncheck();
    await expect(page.getByText('On-site registration could not be changed. Please try again.')).toBeVisible();
    await expect(enabled).toBeChecked();
    await page.context().close();
  });

  test('leaving with unsaved changes asks first', async ({ browser }) => {
    const page = await adminPage(browser);
    await serveEvent(page, { imageUrl: '/og-image.png' });
    await page.goto('/admin/events/event-qa');
    await page.getByPlaceholder(/my awesome concert/i).fill('Renamed show');

    await page.getByRole('link', { name: 'Events', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Save your changes?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Stay on this page' }).click();
    await expect(page).toHaveURL(/\/admin\/events\/event-qa$/);
    await expect(page.getByPlaceholder(/my awesome concert/i)).toHaveValue('Renamed show');

    await page.getByRole('link', { name: 'Events', exact: true }).click();
    await dialog.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    await page.context().close();
  });

  test('unsaved changes survive a reload and can be restored', async ({ browser }) => {
    const page = await adminPage(browser);
    await serveEvent(page, { imageUrl: '/og-image.png' });
    await page.goto('/admin/events/event-qa');
    await page.getByPlaceholder(/my awesome concert/i).fill('Kept on this device');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('tixora:event-edit:event-qa:v1')))
      .toContain('Kept on this device');

    page.on('dialog', (d) => d.accept());
    await page.reload();
    await expect(page.getByText(/You have unsaved changes from/)).toBeVisible();
    await page.getByRole('button', { name: 'Restore my changes' }).click();
    await expect(page.getByPlaceholder(/my awesome concert/i)).toHaveValue('Kept on this device');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.context().close();
  });

  test('publishing a draft lists what is missing, then publishes once ready', async ({ browser }) => {
    const page = await adminPage(browser);
    await serveEvent(page, { status: 'draft', imageUrl: null });
    await page.goto('/admin/events/event-qa');
    await page.getByRole('button', { name: /^Review:/ }).click();
    await page.getByRole('button', { name: 'Publish event' }).click();
    await expect(page.getByRole('alert').filter({ hasText: "isn't ready to publish" })).toBeVisible();
    await expect(page.getByText('A cover image is required before this event can be published').first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Publish this event?' })).toHaveCount(0);
    await page.context().close();

    const ready = await adminPage(browser);
    await serveEvent(ready, { status: 'draft', imageUrl: '/og-image.png' });
    await ready.goto('/admin/events/event-qa');
    await ready.getByRole('button', { name: /^Review:/ }).click();
    await expect(ready.getByRole('heading', { name: "Everything's ready." })).toBeVisible();
    await ready.getByRole('button', { name: 'Publish event' }).click();
    const confirm = ready.getByRole('dialog', { name: 'Publish this event?' });
    const put = ready.waitForRequest((r) => EVENT_URL.test(r.url()) && r.method() === 'PUT');
    await confirm.getByRole('button', { name: 'Publish event' }).click();
    expect((await put).postDataJSON()).toMatchObject({ status: 'on_sale' });
    await expect(ready.getByText('Event published.')).toBeVisible();
    await ready.context().close();
  });
});

test.describe('Event deletion', () => {
  test('a refused delete shows the reason from the server', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.route(EVENT_URL, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              statusCode: 409,
              message: "This event has registrations or orders and can't be deleted. Cancel it instead.",
            }),
          })
        : route.fallback(),
    );
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByText("Events with registrations or orders can't be deleted; cancel them instead.")).toBeVisible();
    await page.getByRole('button', { name: 'Delete event' }).click();
    await expect(page.getByText("This event has registrations or orders and can't be deleted. Cancel it instead.")).toBeVisible();
    await page.context().close();
  });
});
