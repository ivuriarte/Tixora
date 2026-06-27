/**
 * One-off fix: reassign any organizations where the createdBy user does not
 * match the org's owner member — a symptom of the broken apply-again flow
 * that logged the user out and ran GuestApplicationFlow, creating a new user
 * and a new org record with the wrong creator.
 *
 * What this does:
 *   1. Finds every organization whose created_by_id doesn't match any of its
 *      owner members (i.e. the creator and the owner are different people).
 *   2. For each, finds the canonical owner (the org member with role 'owner')
 *      whose email the admin recognises as the real applicant.
 *   3. Updates organizations.created_by_id to the owner's user id.
 *   4. Optionally deletes the orphaned "ghost" user that was created by the
 *      guest flow (only if they have no events, orders, or registrations).
 *
 * Usage (from apps/api):
 *   npx tsx prisma/fix-org-resubmit-creator.ts           -- dry run (prints plan)
 *   npx tsx prisma/fix-org-resubmit-creator.ts --apply   -- apply fixes
 *   npx tsx prisma/fix-org-resubmit-creator.ts --apply --cleanup  -- also delete ghost users
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const UAT = process.argv.includes('--uat');

const PROD_PROJECT_REF = 'nwzfiftzubjppoitmzjs';

let datasourceUrl: string | undefined;
if (UAT) {
  datasourceUrl = process.env.DATABASE_URL_UAT;
  if (!datasourceUrl) {
    console.error('\n[ERROR] DATABASE_URL_UAT not set in .env\n');
    process.exit(1);
  }
  if (datasourceUrl.includes(PROD_PROJECT_REF)) {
    console.error('\n[BLOCKED] DATABASE_URL_UAT points to production. Aborting.\n');
    process.exit(1);
  }
}

const prisma = new PrismaClient(UAT ? { datasources: { db: { url: datasourceUrl } } } : {});

const APPLY   = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');

async function main() {
  console.log('\n=== Organizer creator mismatch fix ===');
  console.log(UAT   ? '🎯  Target: UAT database' : '🏠  Target: local database (pass --uat for UAT)');
  console.log(APPLY ? '⚡  Mode: APPLY' : '🔍  Mode: DRY RUN (pass --apply to commit changes)');
  if (CLEANUP) console.log('🧹  --cleanup: ghost users will be deleted if safe');
  console.log('');

  // Detect duplicate org names where one is rejected (original applicant) and
  // another is pending/approved (created via the broken guest-flow resubmission).
  // The rejected org's owner is the REAL applicant; the newer org is the ghost.
  const allOrgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      approvalStatus: true,
      createdById: true,
      createdAt: true,
      createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      members: {
        where: { role: 'owner' },
        select: { userId: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by normalised name
  const byName = new Map<string, typeof allOrgs>();
  for (const org of allOrgs) {
    const key = org.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(org);
  }

  // A "ghost" pair: same name, one rejected org (the real applicant) + one
  // pending/approved org owned by a different user (the ghost).
  type GhostPair = {
    realOrg:   typeof allOrgs[0];
    ghostOrg:  typeof allOrgs[0];
    realUser:  { id: string; email: string; firstName: string | null; lastName: string | null };
    ghostUser: { id: string; email: string; firstName: string | null; lastName: string | null };
  };

  const pairs: GhostPair[] = [];

  for (const [, group] of byName) {
    if (group.length < 2) continue;
    const rejected   = group.filter((o) => o.approvalStatus === 'rejected');
    const notRejected = group.filter((o) => o.approvalStatus !== 'rejected');
    for (const realOrg of rejected) {
      const realOwner = realOrg.members[0];
      if (!realOwner) continue;
      for (const ghostOrg of notRejected) {
        const ghostOwner = ghostOrg.members[0];
        if (!ghostOwner) continue;
        // Different owners → this is the ghost pair
        if (realOwner.userId !== ghostOwner.userId) {
          pairs.push({
            realOrg,
            ghostOrg,
            realUser:  realOwner.user,
            ghostUser: ghostOwner.user,
          });
        }
      }
    }
  }

  if (pairs.length === 0) {
    console.log('✓ No ghost resubmission orgs found. Nothing to fix.\n');
    return;
  }

  console.log(`Found ${pairs.length} ghost resubmission pair(s):\n`);

  for (const { realOrg, ghostOrg, realUser, ghostUser } of pairs) {

    console.log(`  Real org (rejected):  "${realOrg.name}" (${realOrg.id})`);
    console.log(`  Real applicant:       ${realUser.email} — ${realUser.firstName ?? ''} ${realUser.lastName ?? ''}`);
    console.log(`  Ghost org (${ghostOrg.approvalStatus}): "${ghostOrg.name}" (${ghostOrg.id})`);
    console.log(`  Ghost user (wrong):   ${ghostUser.email} — ${ghostUser.firstName ?? ''} ${ghostUser.lastName ?? ''}`);

    if (APPLY) {
      // Reassign the ghost org's createdById to the real applicant
      await prisma.organization.update({
        where: { id: ghostOrg.id },
        data: { createdById: realUser.id },
      });
      // Reassign the owner member of the ghost org to the real applicant
      await prisma.organizationMember.updateMany({
        where: { organizationId: ghostOrg.id, userId: ghostUser.id, role: 'owner' },
        data: { userId: realUser.id },
      });
      console.log(`  ✓ Reassigned ghost org creator + owner to ${realUser.email}`);
    } else {
      console.log(`  → Would reassign ghost org creator + owner to ${realUser.email}`);
    }

    if (CLEANUP && ghostUser.id !== realUser.id) {
      const [eventCount, orderCount, regCount] = await Promise.all([
        prisma.event.count({ where: { createdById: ghostUser.id } }),
        prisma.order.count({ where: { userId: ghostUser.id } }),
        prisma.registration.count({ where: { userId: ghostUser.id } }),
      ]);

      if (eventCount > 0 || orderCount > 0 || regCount > 0) {
        console.log(
          `  ⚠  Ghost user ${ghostUser.email} has events/orders/registrations — skipping delete.`,
        );
      } else if (APPLY) {
        await prisma.auditLog.updateMany({
          where: { performedById: ghostUser.id },
          data: { performedById: null },
        });
        await prisma.organizationMember.deleteMany({ where: { userId: ghostUser.id } });
        await prisma.user.delete({ where: { id: ghostUser.id } });
        console.log(`  ✓ Deleted ghost user ${ghostUser.email} (${ghostUser.id})`);
      } else {
        console.log(
          `  → Would delete ghost user ${ghostUser.email} (${ghostUser.id}) — no linked events/orders/registrations`,
        );
      }
    }

    console.log('');
  }

  if (!APPLY) {
    console.log('Run with --apply to commit these changes.\n');
  } else {
    console.log('Done.\n');
  }
}

main()
  .catch((e) => { console.error('\n✗ Failed:', e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
