import { expect, expectNoBrowserFailures, test } from './support/qa-test';
import { CUSTOMER_EMAIL, HAS_CUSTOMER_MAILBOX } from './support/customer-auth';

test.describe('Authenticated customer UAT', () => {
  test.skip(!HAS_CUSTOMER_MAILBOX, 'The controlled customer mailbox is not configured.');

  test('saved OTP session restores the customer account without another code', async ({
    page,
    diagnostics,
  }) => {
    await page.goto('/account/tickets');
    await expect(page).toHaveURL(/\/account\/tickets/);
    await expect(page.getByRole('heading', { name: 'My Events' })).toBeVisible();
    await expect(page.getByText(CUSTOMER_EMAIL, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Enter Email' })).toHaveCount(0);
    expectNoBrowserFailures(diagnostics);
  });
});
