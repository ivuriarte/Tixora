import { resolve } from 'node:path';

const cwd = process.cwd();
const webRoot = cwd.endsWith('/apps/web') ? cwd : resolve(cwd, 'apps/web');

export const ADMIN_STORAGE_STATE = resolve(webRoot, 'playwright/.auth/admin.json');

export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL?.trim() ?? '';
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? '';

export const HAS_ADMIN_CREDENTIALS = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
