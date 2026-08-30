import { resolve } from 'node:path';

const cwd = process.cwd();
const webRoot = cwd.endsWith('/apps/web') ? cwd : resolve(cwd, 'apps/web');

export const CUSTOMER_STORAGE_STATE = resolve(webRoot, 'playwright/.auth/customer.json');
export const CUSTOMER_EMAIL =
  process.env.TEST_CUSTOMER_EMAIL?.trim().toLowerCase() ?? 'ivvuriarte@gmail.com';

export const HAS_CUSTOMER_MAILBOX = Boolean(
  CUSTOMER_EMAIL &&
  process.env.TEST_GMAIL_CLIENT_ID &&
  process.env.TEST_GMAIL_CLIENT_SECRET &&
  process.env.TEST_GMAIL_REFRESH_TOKEN,
);
