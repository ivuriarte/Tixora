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

  // Create a test event
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000); // 3 hours later

  const event = await prisma.event.upsert({
    where: { slug: 'test-concert-manila-2026' },
    update: {},
    create: {
      title: 'Test Concert Manila 2026',
      slug: 'test-concert-manila-2026',
      description: 'A test event to verify the Axon Tickets ticketing platform end-to-end.',
      venue: 'SM Mall of Asia Arena',
      city: 'Pasay',
      startsAt,
      endsAt,
      status: 'published',
      createdById: admin.id,
      tiers: {
        create: [
          {
            name: 'General Admission',
            price: 1500,
            totalQuantity: 500,
            description: 'Standing area access',
          },
          {
            name: 'VIP',
            price: 4500,
            totalQuantity: 50,
            description: 'VIP section with premium view',
          },
        ],
      },
    },
    include: { tiers: true },
  });

  console.log('Event created:', event.title, event.id);
  console.log('Tiers:', event.tiers.map((t: { name: string; price: unknown }) => `${t.name} @ ₱${t.price}`));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
