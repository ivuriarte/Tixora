/**
 * One-off script: hard-delete a user and all their connected data.
 * Usage:
 *   npx tsx prisma/delete-user.ts <userId>
 *   npx tsx prisma/delete-user.ts --email <email>
 *   npm run delete-ian          (from apps/api — always finds Ian by email)
 *
 * Deletion order (respects FK constraints):
 *  1. NULL out nullable admin/audit references pointing at this user
 *  2. Delete fraud_flags owned by the user
 *  3. Delete orders (cascades → order_items, tickets)
 *  4. Delete reservations
 *  5. Delete registrations (cascades → attendees, payment_proofs)
 *  6. Check for events created by this user; reassign or abort
 *  7. Delete the user  (cascades → otp_codes)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emailFlagIdx = process.argv.indexOf('--email');
  let user;

  if (emailFlagIdx !== -1) {
    const email = process.argv[emailFlagIdx + 1];
    if (!email) {
      console.error('Usage: npx tsx prisma/delete-user.ts --email <email>');
      process.exit(1);
    }
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
  } else {
    const userId = process.argv[2];
    if (!userId) {
      console.error('Usage: npx tsx prisma/delete-user.ts <userId>\n       npx tsx prisma/delete-user.ts --email <email>');
      process.exit(1);
    }
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.error(`User ${userId} not found.`);
      process.exit(1);
    }
  }

  const userId = user.id;

  console.log(`\nDeleting user: ${user.email} (${user.id})`);
  console.log('─────────────────────────────────────────────────');

  // ── Guard: check if the user has created events ──────────────────────────
  const ownedEvents = await prisma.event.findMany({
    where: { createdById: userId },
    select: { id: true, title: true },
  });

  if (ownedEvents.length > 0) {
    console.log(`\n⚠  This user owns ${ownedEvents.length} event(s):`);
    ownedEvents.forEach((e) => console.log(`   • ${e.title} (${e.id})`));
    console.log(
      '\n   Events cannot be deleted without removing ALL linked tickets,\n' +
      '   orders, and registrations from other attendees too.\n' +
      '   Reassign these events to another admin before running this script,\n' +
      '   or provide a --force flag to delete them (destroys all linked data).',
    );

    if (!process.argv.includes('--force')) {
      console.log('\nAborted. Re-run with --force to proceed anyway.\n');
      process.exit(1);
    }

    console.log('\n  --force supplied — events and all their data will be deleted.\n');
  }

  // ── Run everything in a single transaction ────────────────────────────────
  await prisma.$transaction(async (tx) => {

    // 1a. NULL confirmedByAdminId on orders
    const r1 = await tx.order.updateMany({
      where: { confirmedByAdminId: userId },
      data: { confirmedByAdminId: null },
    });
    if (r1.count) console.log(`  nulled orders.confirmedByAdminId: ${r1.count}`);

    // 1b. NULL checkedInById on tickets
    const r2 = await tx.ticket.updateMany({
      where: { checkedInById: userId },
      data: { checkedInById: null },
    });
    if (r2.count) console.log(`  nulled tickets.checkedInById: ${r2.count}`);

    // 1c. NULL verifiedById on registrations
    const r3 = await tx.registration.updateMany({
      where: { verifiedById: userId },
      data: { verifiedById: null },
    });
    if (r3.count) console.log(`  nulled registrations.verifiedById: ${r3.count}`);

    // 1d. NULL reviewedById on payment_proofs
    const r4 = await tx.paymentProof.updateMany({
      where: { reviewedById: userId },
      data: { reviewedById: null },
    });
    if (r4.count) console.log(`  nulled payment_proofs.reviewedById: ${r4.count}`);

    // 1e. NULL performedById on audit_logs
    const r5 = await tx.auditLog.updateMany({
      where: { performedById: userId },
      data: { performedById: null },
    });
    if (r5.count) console.log(`  nulled audit_logs.performedById: ${r5.count}`);

    // 2. Fraud flags
    const r6 = await tx.fraudFlag.deleteMany({ where: { userId } });
    if (r6.count) console.log(`  deleted fraud_flags: ${r6.count}`);

    // 3. Orders → cascades order_items + tickets
    const r7 = await tx.order.deleteMany({ where: { userId } });
    if (r7.count) console.log(`  deleted orders (+ cascaded items/tickets): ${r7.count}`);

    // 4. Reservations
    const r8 = await tx.reservation.deleteMany({ where: { userId } });
    if (r8.count) console.log(`  deleted reservations: ${r8.count}`);

    // 5. Registrations → cascades attendees + payment_proofs
    const r9 = await tx.registration.deleteMany({ where: { userId } });
    if (r9.count) console.log(`  deleted registrations (+ cascaded attendees/proofs): ${r9.count}`);

    // 6. Events (--force only)
    if (process.argv.includes('--force') && ownedEvents.length > 0) {
      // Orders/tickets/registrations referencing these events were already
      // deleted above (they all belong to this same user in a test env).
      // For safety, delete remaining references first.
      const eventIds = ownedEvents.map((e) => e.id);

      await tx.fraudFlag.deleteMany({ where: { order: { eventId: { in: eventIds } } } });
      await tx.order.deleteMany({ where: { eventId: { in: eventIds } } });
      await tx.reservation.deleteMany({ where: { eventId: { in: eventIds } } });
      await tx.registration.deleteMany({ where: { eventId: { in: eventIds } } });
      const r10 = await tx.event.deleteMany({ where: { id: { in: eventIds } } });
      if (r10.count) console.log(`  deleted events (+ cascaded tiers/views): ${r10.count}`);
    }

    // 7. Delete the user — otp_codes cascade automatically
    await tx.user.delete({ where: { id: userId } });
    console.log(`\n✓ User ${user.email} deleted successfully.\n`);
  });
}

main()
  .catch((e) => {
    console.error('\n✗ Deletion failed:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
