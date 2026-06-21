/**
 * Migration safety guard.
 *
 * Run before any `prisma migrate deploy` to confirm the target database.
 * Blocks silently if DIRECT_URL points to production unless --allow-production
 * is passed explicitly.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/check-migrate-target.ts
 *   npx ts-node --transpile-only prisma/check-migrate-target.ts --allow-production
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PROD_PROJECT_REF = 'nwzfiftzubjppoitmzjs';
const allowProduction = process.argv.includes('--allow-production');

const directUrl = process.env.DIRECT_URL ?? '';

if (!directUrl) {
  process.stderr.write('\n[ERROR] DIRECT_URL is not set. Check your .env file.\n\n');
  process.exit(1);
}

const isProduction = directUrl.includes(PROD_PROJECT_REF);

if (isProduction && !allowProduction) {
  process.stderr.write('\n[BLOCKED] DIRECT_URL points to the PRODUCTION database.\n');
  process.stderr.write(`  Project ref "${PROD_PROJECT_REF}" detected in connection string.\n`);
  process.stderr.write('\n  To migrate production intentionally, run:\n');
  process.stderr.write('    npm run db:migrate:prod\n\n');
  process.exit(1);
}

const label = isProduction ? 'PRODUCTION ⚠️' : 'non-production (UAT / dev) ✅';

try {
  const url = new URL(directUrl);
  process.stdout.write(`[OK] Migration target: ${label}\n`);
  process.stdout.write(`     Host: ${url.hostname}\n`);
  process.stdout.write(`     User: ${url.username}\n\n`);
} catch {
  process.stdout.write(`[OK] Migration target: ${label}\n\n`);
}
