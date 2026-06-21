/**
 * Runs `prisma migrate deploy` targeting the UAT database.
 * Reads DIRECT_URL_UAT and DATABASE_URL_UAT from .env and overrides
 * DIRECT_URL / DATABASE_URL for this process only.
 *
 * Usage (from apps/api):
 *   npm run db:migrate:uat
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PROD_PROJECT_REF = 'nwzfiftzubjppoitmzjs';

const uatDirect = process.env.DIRECT_URL_UAT;
const uatPooler = process.env.DATABASE_URL_UAT;

if (!uatDirect || !uatPooler) {
  process.stderr.write(
    '\n[ERROR] DIRECT_URL_UAT and DATABASE_URL_UAT must be set in apps/api/.env\n' +
    '        Copy these from your UAT Supabase project → Connect → ORM → Prisma\n\n',
  );
  process.exit(1);
}

if (uatDirect.includes(PROD_PROJECT_REF) || uatPooler.includes(PROD_PROJECT_REF)) {
  process.stderr.write(
    '\n[BLOCKED] UAT URLs point to the production database. Check your .env file.\n\n',
  );
  process.exit(1);
}

try {
  const url = new URL(uatDirect);
  process.stdout.write(`[OK] Migrating UAT database: ${url.hostname}\n\n`);
} catch {
  process.stdout.write(`[OK] Migrating UAT database...\n\n`);
}

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, DIRECT_URL: uatDirect, DATABASE_URL: uatPooler },
});
