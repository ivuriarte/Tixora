import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, expectNoBrowserFailures, test } from './support/qa-test';
import {
  CUSTOMER_EMAIL,
  CUSTOMER_STORAGE_STATE,
  HAS_CUSTOMER_MAILBOX,
} from './support/customer-auth';
import { waitForAxonOtp } from './support/gmail-otp';

test('authenticate the configured customer through the real email OTP flow', async ({
  page,
  diagnostics,
}) => {
  test.setTimeout(150_000);
  test.skip(
    !HAS_CUSTOMER_MAILBOX,
    'Configure the controlled Gmail OAuth secrets to run the real customer OTP journey.',
  );

  await page.goto('/auth/access?redirect=/account/tickets');
  await expect(page.getByRole('heading', { name: 'Enter Email' })).toBeVisible();
  await page.getByLabel('Email address').fill(CUSTOMER_EMAIL);

  const requestedAt = Date.now();
  await page.getByRole('button', { name: 'Send my code' }).click();
  await expect(page.getByLabel('Enter the 6-digit code')).toBeVisible();

  const otp = await waitForAxonOtp(CUSTOMER_EMAIL, requestedAt);
  await page.getByLabel('Enter the 6-digit code').fill(otp);
  await page.waitForURL(/\/account\/tickets(?:\?|$)/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'My Events' })).toBeVisible();

  const storedSession = await page.evaluate(() => ({
    hasRefreshToken: Boolean(window.localStorage.getItem('axon_tickets_rt')),
  }));
  expect(storedSession.hasRefreshToken).toBe(true);

  await mkdir(dirname(CUSTOMER_STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: CUSTOMER_STORAGE_STATE });
  expectNoBrowserFailures(diagnostics);
});
