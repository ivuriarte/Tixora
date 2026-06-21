/**
 * Migration Safety Check
 *
 * Prevents destructive migrations from running against production.
 * Used by all migration scripts (db:migrate:*, db:reset:*, db:seed).
 *
 * Production project reference: nwzfiftzubjppoitmzjs
 * UAT project reference: eiansrxggrvwzikpqhmt
 *
 * Usage:
 *   npx ts-node prisma/check-migrate-target.ts [--allow-production]
 *
 * Exit codes:
 *   0 = OK to proceed
 *   1 = Blocked (attempted production migration without flag)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PRODUCTION_PROJECT_REF = 'nwzfiftzubjppoitmzjs';
const UAT_PROJECT_REF = 'eiansrxggrvwzikpqhmt';

function detectTarget(dbUrl: string): 'production' | 'uat' | 'development' | 'unknown' {
  if (dbUrl.includes(PRODUCTION_PROJECT_REF)) return 'production';
  if (dbUrl.includes(UAT_PROJECT_REF)) return 'uat';
  if (dbUrl.includes('localhost')) return 'development';
  return 'unknown';
}

async function checkMigrateTarget() {
  const directUrl = process.env.DIRECT_URL ?? '';
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const appEnv = process.env.APP_ENV ?? 'development';
  const allowProduction = process.argv.includes('--allow-production');

  const target = detectTarget(directUrl || databaseUrl);

  console.log(`\n🔍 Migration Safety Check`);
  console.log(`   Target: ${target} (${appEnv})`);
  console.log(`   URL: ${(directUrl || databaseUrl).substring(0, 60)}...`);

  if (target === 'production') {
    if (!allowProduction) {
      console.error(
        `\n❌ BLOCKED: Attempted to migrate production without --allow-production flag.\n` +
        `   This is a safety measure. If you really intend to migrate production:\n` +
        `   1. Use a direct console with --allow-production\n` +
        `   2. In CI/CD, use the PRODUCTION_DIRECT_URL secret\n` +
        `   3. Always run migrations via npm scripts with automated safety checks\n\n` +
        `   DO NOT use DIRECT_URL=production-url directly in shell.\n`
      );
      process.exit(1);
    }
    console.warn(`\n⚠️  PRODUCTION MIGRATION ALLOWED (--allow-production flag present)`);
    console.warn(`   Proceeding with caution. Ensure you have a backup.\n`);
  } else if (target === 'uat') {
    console.log(`✅ Safe: migrating UAT database\n`);
  } else if (target === 'development') {
    console.log(`✅ Safe: migrating local development database\n`);
  } else {
    console.warn(`⚠️  Unknown target — proceeding (not recognized as production)\n`);
  }

  process.exit(0);
}

checkMigrateTarget().catch((err) => {
  console.error(err);
  process.exit(1);
});
