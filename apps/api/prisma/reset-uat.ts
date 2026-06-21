/**
 * UAT database reset — truncates all tables and reseeds fresh test data.
 *
 * SAFETY: Blocked if DIRECT_URL points to the production database.
 *
 * Usage (from apps/api):
 *   npm run db:reset:uat
 *
 * Requires in .env:
 *   DIRECT_URL_UAT=...   (the UAT direct connection string)
 *   DATABASE_URL_UAT=... (the UAT transaction pooler string)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PROD_PROJECT_REF = 'nwzfiftzubjppoitmzjs';

const uatDirect = process.env.DIRECT_URL_UAT;
const uatPooler = process.env.DATABASE_URL_UAT;

if (!uatDirect || !uatPooler) {
  process.stderr.write(
    '\n[ERROR] DIRECT_URL_UAT and DATABASE_URL_UAT must be set in your .env file.\n' +
    '        These are the connection strings for the UAT Supabase project.\n\n',
  );
  process.exit(1);
}

if (uatDirect.includes(PROD_PROJECT_REF) || uatPooler.includes(PROD_PROJECT_REF)) {
  process.stderr.write(
    '\n[BLOCKED] DIRECT_URL_UAT or DATABASE_URL_UAT points to the PRODUCTION database.\n' +
    '          UAT reset is only allowed on the non-production Supabase project.\n\n',
  );
  process.exit(1);
}

// Point Prisma at UAT for this process
process.env.DIRECT_URL = uatDirect;
process.env.DATABASE_URL = uatPooler;

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: uatDirect } } });

  process.stdout.write('\n⚠️  Resetting UAT database — all data will be deleted...\n\n');

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs",
      "payment_proofs",
      "attendees",
      "registration_funnel_events",
      "event_views",
      "registrations",
      "fraud_flags",
      "tickets",
      "order_items",
      "orders",
      "reservations",
      "otp_codes",
      "ticket_tiers",
      "events",
      "users"
    RESTART IDENTITY CASCADE
  `);

  await prisma.$disconnect();

  process.stdout.write('✅ All tables truncated.\n');
  process.stdout.write('🌱 Reseeding...\n\n');

  execSync('npm run db:seed', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DIRECT_URL: uatDirect, DATABASE_URL: uatPooler },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
