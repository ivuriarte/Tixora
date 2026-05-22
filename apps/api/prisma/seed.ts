import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Upsert admin user
  const passwordHash = await bcrypt.hash('admin', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin' },
    update: { isAdmin: true, passwordHash },
    create: {
      email: 'admin',
      passwordHash,
      firstName: 'Admin',
      lastName: '',
      isAdmin: true,
      isVerified: true,
    },
  });
  console.log('Admin user:', admin.email, admin.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

// Removed: Francis Kong demo event (was seeded for MVP testing)
  const startsAt = new Date('2026-09-20T08:00:00+08:00');
  const endsAt = new Date('2026-09-20T17:00:00+08:00');

  const event = await prisma.event.upsert({
    where: { slug: 'francis-kong-build-to-lead-davao-2026' },
    update: {},
    create: {
      title: 'Francis Kong: Build to Lead — Davao 2026',
      slug: 'francis-kong-build-to-lead-davao-2026',
      description:
        'Join internationally acclaimed motivational speaker and leadership expert Francis Kong for a full-day conference designed to equip business leaders, entrepreneurs, and professionals with practical tools to build winning organizations.\n\nLearn how to lead with purpose, grow your people, and build a resilient business in today\'s fast-changing world.',
      venue: 'SMX Convention Center Davao',
      city: 'Davao City',
      startsAt,
      endsAt,
      status: 'on_sale',
      speakerName: 'Francis Kong',
      agenda: [
        { time: '7:00 AM', title: 'Registration & Morning Snacks' },
        { time: '8:00 AM', title: 'Opening & Welcome Remarks' },
        { time: '8:30 AM', title: 'Session 1: The Leader\'s Mindset', description: 'Setting the foundation for high-performance leadership' },
        { time: '10:00 AM', title: 'Break' },
        { time: '10:15 AM', title: 'Session 2: Building Your Dream Team', description: 'How to attract, retain, and develop A-players' },
        { time: '12:00 PM', title: 'Lunch Break' },
        { time: '1:00 PM', title: 'Session 3: Navigating Business Challenges', description: 'Resilience strategies for modern entrepreneurs' },
        { time: '2:30 PM', title: 'Break' },
        { time: '2:45 PM', title: 'Session 4: Your Legacy Plan', description: 'Leaving a lasting impact on your organization and community' },
        { time: '4:15 PM', title: 'Open Q&A with Francis Kong' },
        { time: '5:00 PM', title: 'Closing Remarks & Certificate Distribution' },
      ],
      sponsors: [
        { name: 'Presented by Motivate Asia', tier: 'Title' },
        { name: 'Globe Business', tier: 'Gold' },
        { name: 'Business World', tier: 'Media' },
      ],
      faqs: [
        {
          question: 'What is included in the ticket price?',
          answer: 'Your ticket includes full-day conference access, morning snacks, lunch, afternoon snacks, and a certificate of attendance.',
        },
        {
          question: 'Can I transfer my ticket to someone else?',
          answer: 'Tickets are non-transferable. The name on the registration will be used for the certificate of attendance.',
        },
        {
          question: 'What should I bring?',
          answer: 'Bring a valid ID and your QR ticket (sent to your email). You may also bring a notebook and pen for taking notes.',
        },
        {
          question: 'Is parking available?',
          answer: 'Yes, SMX Convention Center Davao has ample parking. We recommend arriving early as parking may fill up.',
        },
        {
          question: 'Will the event be recorded?',
          answer: 'The event will not be recorded or live-streamed. This is an in-person only event.',
        },
      ],
      createdById: admin.id,
      tiers: {
        create: [
          {
            name: 'Early Bird',
            price: 299900,
            totalQuantity: 100,
            description: 'Limited early bird rate — first 100 seats only',
            sortOrder: 1,
          },
          {
            name: 'Regular',
            price: 399900,
            totalQuantity: 300,
            description: 'Standard conference ticket',
            sortOrder: 2,
          },
          {
            name: 'VIP',
            price: 699900,
            totalQuantity: 50,
            description: 'VIP front-row seating, priority Q&A access, and exclusive photo opportunity with Francis Kong',
            sortOrder: 3,
          },
        ],
      },
    },
    include: { tiers: true },
  });

  console.log('Event:', event.title, event.id);
  console.log('Tiers:', event.tiers.map((t: { name: string; price: unknown }) => `${t.name} @ ₱${t.price}`));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
