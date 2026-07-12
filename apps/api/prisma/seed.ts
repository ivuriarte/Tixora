/**
 * UAT seed — creates deterministic test data covering every registration status,
 * payment proof state, and check-in scenario.
 *
 * Idempotent: safe to run multiple times (uses upsert throughout).
 *
 * Required env var:
 *   SEED_ADMIN_EMAIL   — the email address for the admin account
 *
 * Optional env var:
 *   SEED_ADMIN_PASSWORD — fixed password for admin (auto-generated and printed if unset)
 *
 * Usage (from apps/api):
 *   npm run db:seed
 */

import { PrismaClient, RegistrationStatus, ProofStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PROD_PROJECT_REF = 'nwzfiftzubjppoitmzjs';

function deterministicId(seed: string): string {
  const h = crypto.createHash('md5').update(`axon-uat-seed::${seed}`).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join('-');
}

const prisma = new PrismaClient();

async function main() {
  // ── Guard: never seed production ────────────────────────────────────────
  const directUrl = process.env.DIRECT_URL ?? '';
  if (directUrl.includes(PROD_PROJECT_REF) && process.env.APP_ENV === 'production') {
    throw new Error('[BLOCKED] Refusing to seed the production database.');
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error(
      'SEED_ADMIN_EMAIL is required. Add it to your .env file.\n' +
      'Example: SEED_ADMIN_EMAIL=ivvuriarte@gmail.com',
    );
  }

  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? crypto.randomBytes(12).toString('hex');
  const showGeneratedPassword = !process.env.SEED_ADMIN_PASSWORD;

  process.stdout.write('\n🌱 Seeding database...\n\n');

  // ── Admin user ───────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { isAdmin: true, isVerified: true, passwordHash: adminHash },
    create: {
      id: deterministicId('admin'),
      email: adminEmail,
      firstName: 'Admin',
      lastName: 'User',
      passwordHash: adminHash,
      isAdmin: true,
      isVerified: true,
      phone: '+639000000000',
    },
  });

  process.stdout.write(`✅ Admin:      ${admin.email}\n`);
  if (showGeneratedPassword) {
    process.stdout.write(`🔑 Password:   ${adminPassword}  ← save this now\n`);
    process.stdout.write(
      `   (Set SEED_ADMIN_PASSWORD in .env to pin a fixed password on reseed)\n`,
    );
  }

  // ── Test users ───────────────────────────────────────────────────────────
  const testHash = await bcrypt.hash('Test1234!', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'testuser1@axon.uat' },
    update: {},
    create: {
      id: deterministicId('user1'),
      email: 'testuser1@axon.uat',
      firstName: 'Maria',
      lastName: 'Santos',
      phone: '+639111111111',
      passwordHash: testHash,
      isVerified: true,
      company: 'Santos Corp',
      jobTitle: 'Manager',
      city: 'Manila',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'testuser2@axon.uat' },
    update: {},
    create: {
      id: deterministicId('user2'),
      email: 'testuser2@axon.uat',
      firstName: 'Jose',
      lastName: 'Reyes',
      phone: '+639222222222',
      passwordHash: testHash,
      isVerified: true,
      company: 'Reyes Inc',
      jobTitle: 'Director',
      city: 'Cebu',
    },
  });

  process.stdout.write(
    `✅ Test users: testuser1@axon.uat, testuser2@axon.uat  (password: Test1234!)\n`,
  );

  // ── Event 1: Leadership Conference ──────────────────────────────────────
  const conf = await prisma.event.upsert({
    where: { slug: 'uat-leadership-conference-2026' },
    update: {},
    create: {
      id: deterministicId('event-conf'),
      slug: 'uat-leadership-conference-2026',
      title: '[UAT] Leadership Conference 2026',
      description: 'A full-day leadership conference — UAT test event, not real.',
      venue: 'SMX Convention Center',
      address: 'Mall of Asia Complex, Pasay City',
      city: 'Manila',
      startsAt: new Date('2026-08-15T08:00:00+08:00'),
      endsAt: new Date('2026-08-15T18:00:00+08:00'),
      status: 'on_sale',
      maxCapacity: 200,
      maxPerUser: 5,
      speakerName: 'Dr. Test Speaker',
      tagline: 'FULL-DAY LEADERSHIP CONFERENCE',
      isFeatured: false,
      platformFee: 50,
      allowManualPayment: true,
      gcashNumber: '09171234567',
      bankName: 'BPI',
      bankAccountNumber: '1234567890',
      bankAccountName: 'UAT Test Account',
      createdById: admin.id,
    },
  });

  const tierVip = await prisma.ticketTier.upsert({
    where: { id: deterministicId('tier-conf-vip') },
    update: {},
    create: {
      id: deterministicId('tier-conf-vip'),
      eventId: conf.id,
      name: 'VIP',
      description: 'Front-row seating, lunch included, exclusive Q&A session',
      price: 3500,
      totalQuantity: 30,
      soldQuantity: 1,
      maxPerOrder: 2,
      sortOrder: 0,
    },
  });

  const tierGa = await prisma.ticketTier.upsert({
    where: { id: deterministicId('tier-conf-ga') },
    update: {},
    create: {
      id: deterministicId('tier-conf-ga'),
      eventId: conf.id,
      name: 'General Admission',
      description: 'Standard seating',
      price: 1500,
      totalQuantity: 150,
      soldQuantity: 5,
      maxPerOrder: 5,
      sortOrder: 1,
    },
  });

  const tierEb = await prisma.ticketTier.upsert({
    where: { id: deterministicId('tier-conf-eb') },
    update: {},
    create: {
      id: deterministicId('tier-conf-eb'),
      eventId: conf.id,
      name: 'Early Bird',
      description: 'Sold out — discount tier for testing sold-out UI',
      price: 999,
      totalQuantity: 20,
      soldQuantity: 20,
      maxPerOrder: 2,
      sortOrder: 2,
    },
  });

  // ── Event 2: Fun Run ─────────────────────────────────────────────────────
  const funrun = await prisma.event.upsert({
    where: { slug: 'uat-fun-run-2026' },
    update: {},
    create: {
      id: deterministicId('event-funrun'),
      slug: 'uat-fun-run-2026',
      title: '[UAT] Axon Fun Run 2026',
      description: 'Annual charity fun run — UAT test event, not real.',
      venue: 'Rizal Park',
      address: 'Roxas Blvd, Manila',
      city: 'Manila',
      startsAt: new Date('2026-09-06T05:00:00+08:00'),
      endsAt: new Date('2026-09-06T10:00:00+08:00'),
      status: 'on_sale',
      maxCapacity: 500,
      maxPerUser: 3,
      platformFee: 30,
      allowManualPayment: true,
      gcashNumber: '09181234567',
      createdById: admin.id,
    },
  });

  const tier5k = await prisma.ticketTier.upsert({
    where: { id: deterministicId('tier-funrun-5k') },
    update: {},
    create: {
      id: deterministicId('tier-funrun-5k'),
      eventId: funrun.id,
      name: '5K Run',
      price: 500,
      totalQuantity: 200,
      soldQuantity: 2,
      maxPerOrder: 3,
      sortOrder: 0,
    },
  });

  const tier10k = await prisma.ticketTier.upsert({
    where: { id: deterministicId('tier-funrun-10k') },
    update: {},
    create: {
      id: deterministicId('tier-funrun-10k'),
      eventId: funrun.id,
      name: '10K Run',
      price: 800,
      totalQuantity: 150,
      soldQuantity: 1,
      maxPerOrder: 3,
      sortOrder: 1,
    },
  });

  process.stdout.write(`✅ Events:     Leadership Conference 2026, Fun Run 2026\n`);

  // ── Registration helper ──────────────────────────────────────────────────
  interface AttendeeInput {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    isLead: boolean;
    qrToken?: string;
    checkedInAt?: Date;
  }

  async function seedRegistration(opts: {
    key: string;
    refNum: string;
    userId: string;
    eventId: string;
    tier: { id: string; name: string; price: number };
    status: RegistrationStatus;
    paymentMethod?: string;
    rejectionReason?: string;
    verifiedById?: string;
    verifiedAt?: Date;
    attendees: AttendeeInput[];
    proof?: { status: ProofStatus; rejectionReason?: string };
    auditAction?: string;
  }) {
    const qty = opts.attendees.length;
    const subtotal = opts.tier.price * qty;
    const fees = 50 * qty;

    const reg = await prisma.registration.upsert({
      where: { referenceNumber: opts.refNum },
      update: {},
      create: {
        id: deterministicId(`reg-${opts.key}`),
        referenceNumber: opts.refNum,
        userId: opts.userId,
        eventId: opts.eventId,
        tierId: opts.tier.id,
        tierName: opts.tier.name,
        unitPrice: opts.tier.price,
        status: opts.status,
        attendeeCount: qty,
        subtotal,
        fees,
        total: subtotal + fees,
        currency: 'PHP',
        paymentMethod: opts.paymentMethod ?? 'gcash',
        rejectionReason: opts.rejectionReason ?? null,
        verifiedById: opts.verifiedById ?? null,
        verifiedAt: opts.verifiedAt ?? null,
      },
    });

    for (let i = 0; i < opts.attendees.length; i++) {
      const a = opts.attendees[i];
      await prisma.attendee.upsert({
        where: { id: deterministicId(`attendee-${opts.key}-${i}`) },
        update: {},
        create: {
          id: deterministicId(`attendee-${opts.key}-${i}`),
          registrationId: reg.id,
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          phone: a.phone ?? null,
          isLead: a.isLead,
          qrToken: a.qrToken ?? null,
          checkedInAt: a.checkedInAt ?? null,
        },
      });
    }

    if (opts.proof) {
      await prisma.paymentProof.upsert({
        where: { id: deterministicId(`proof-${opts.key}`) },
        update: {},
        create: {
          id: deterministicId(`proof-${opts.key}`),
          registrationId: reg.id,
          imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          cloudinaryPublicId: `axon-tickets/uat/proofs/sample-${opts.key}`,
          status: opts.proof.status,
          reviewedById: opts.proof.status !== 'pending' ? admin.id : null,
          reviewedAt: opts.proof.status !== 'pending' ? new Date() : null,
          rejectionReason: opts.proof.rejectionReason ?? null,
        },
      });
    }

    if (opts.auditAction) {
      await prisma.auditLog.upsert({
        where: { id: deterministicId(`audit-${opts.key}`) },
        update: {},
        create: {
          id: deterministicId(`audit-${opts.key}`),
          action: opts.auditAction,
          entityType: 'Registration',
          entityId: reg.id,
          registrationId: reg.id,
          performedById: admin.id,
          metadata: { status: opts.status, ref: opts.refNum },
        },
      });
    }
  }

  // ── 1. pending_payment ───────────────────────────────────────────────────
  await seedRegistration({
    key: 'pending',
    refNum: 'UAT-REG-001',
    userId: user1.id,
    eventId: conf.id,
    tier: { id: tierVip.id, name: tierVip.name, price: 3500 },
    status: 'pending_payment',
    paymentMethod: 'gcash',
    attendees: [
      { firstName: 'Maria', lastName: 'Santos', email: 'testuser1@axon.uat', isLead: true },
    ],
  });

  // ── 2. proof_submitted (group of 2) ─────────────────────────────────────
  await seedRegistration({
    key: 'proof-submitted',
    refNum: 'UAT-REG-002',
    userId: user2.id,
    eventId: conf.id,
    tier: { id: tierGa.id, name: tierGa.name, price: 1500 },
    status: 'proof_submitted',
    paymentMethod: 'bank_transfer',
    attendees: [
      { firstName: 'Jose', lastName: 'Reyes', email: 'testuser2@axon.uat', isLead: true },
      { firstName: 'Ana', lastName: 'Reyes', email: 'ana.reyes@axon.uat', isLead: false },
    ],
    proof: { status: 'pending' },
  });

  // ── 3. verified — QR generated, not yet checked in ──────────────────────
  await seedRegistration({
    key: 'verified',
    refNum: 'UAT-REG-003',
    userId: user1.id,
    eventId: conf.id,
    tier: { id: tierGa.id, name: tierGa.name, price: 1500 },
    status: 'verified',
    paymentMethod: 'gcash',
    verifiedById: admin.id,
    verifiedAt: new Date(Date.now() - 2 * 86_400_000),
    attendees: [
      {
        firstName: 'Maria',
        lastName: 'Santos',
        email: 'testuser1@axon.uat',
        isLead: true,
        qrToken: deterministicId('qr-003-0'),
      },
    ],
    proof: { status: 'approved' },
    auditAction: 'REGISTRATION_VERIFIED',
  });

  // ── 4. verified + checked in (tests check-in scanner flow) ──────────────
  await seedRegistration({
    key: 'checked-in',
    refNum: 'UAT-REG-004',
    userId: user2.id,
    eventId: funrun.id,
    tier: { id: tier5k.id, name: tier5k.name, price: 500 },
    status: 'verified',
    paymentMethod: 'gcash',
    verifiedById: admin.id,
    verifiedAt: new Date(Date.now() - 5 * 86_400_000),
    attendees: [
      {
        firstName: 'Jose',
        lastName: 'Reyes',
        email: 'testuser2@axon.uat',
        isLead: true,
        qrToken: deterministicId('qr-004-0'),
        checkedInAt: new Date(Date.now() - 86_400_000),
      },
    ],
    proof: { status: 'approved' },
    auditAction: 'REGISTRATION_VERIFIED',
  });

  // ── 5. rejected (tests rejection UI + re-upload flow) ───────────────────
  await seedRegistration({
    key: 'rejected',
    refNum: 'UAT-REG-005',
    userId: user1.id,
    eventId: funrun.id,
    tier: { id: tier10k.id, name: tier10k.name, price: 800 },
    status: 'rejected',
    paymentMethod: 'bank_transfer',
    rejectionReason:
      'Payment screenshot is unclear — please resubmit with a clear image showing the full amount.',
    verifiedById: admin.id,
    verifiedAt: new Date(Date.now() - 3 * 86_400_000),
    attendees: [
      { firstName: 'Maria', lastName: 'Santos', email: 'testuser1@axon.uat', isLead: true },
    ],
    proof: { status: 'rejected', rejectionReason: 'Screenshot is too blurry to verify.' },
    auditAction: 'REGISTRATION_REJECTED',
  });

  // ── 6. cancelled ─────────────────────────────────────────────────────────
  await seedRegistration({
    key: 'cancelled',
    refNum: 'UAT-REG-006',
    userId: user2.id,
    eventId: conf.id,
    tier: { id: tierEb.id, name: tierEb.name, price: 999 },
    status: 'cancelled',
    paymentMethod: 'gcash',
    attendees: [
      { firstName: 'Jose', lastName: 'Reyes', email: 'testuser2@axon.uat', isLead: true },
    ],
  });

  process.stdout.write(`\n✅ Registrations seeded:\n`);
  process.stdout.write(`   UAT-REG-001  pending_payment   (conf, VIP, 1 attendee)\n`);
  process.stdout.write(`   UAT-REG-002  proof_submitted   (conf, GA, 2 attendees, proof pending)\n`);
  process.stdout.write(`   UAT-REG-003  verified          (conf, GA, QR ready, not checked in)\n`);
  process.stdout.write(`   UAT-REG-004  verified+checked  (fun run, 5K, already checked in)\n`);
  process.stdout.write(`   UAT-REG-005  rejected          (fun run, 10K, proof rejected)\n`);
  process.stdout.write(`   UAT-REG-006  cancelled         (conf, Early Bird)\n`);
  process.stdout.write(`\n✅ Seed complete.\n\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
