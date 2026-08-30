import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from './support/qa-test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_STORAGE_STATE,
  HAS_ADMIN_CREDENTIALS,
} from './support/admin-auth';

test('authenticate the configured admin test identity once', async ({ page, request }) => {
  test.setTimeout(45_000);
  test.skip(
    !HAS_ADMIN_CREDENTIALS,
    'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for the isolated UAT admin identity.',
  );

  await page.goto('/auth/admin');
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in to Admin Panel' })).toBeVisible();

  const loginResponse = await request.post(
    'https://api-uat.axontickets.online/api/v1/auth/login',
    {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { origin: 'https://uat.axontickets.online' },
    },
  );
  expect(loginResponse.status()).toBe(200);
  const loginPayload = await loginResponse.json();
  expect(loginPayload?.data?.user?.isAdmin).toBe(true);
  const refreshToken = loginPayload?.data?.refreshToken;
  expect(typeof refreshToken).toBe('string');

  await mkdir(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await writeFile(
    ADMIN_STORAGE_STATE,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3100').origin,
          localStorage: [{ name: 'axon_tickets_rt', value: refreshToken }],
        },
      ],
    }),
    { mode: 0o600 },
  );
});
