import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Upsert admin user — password: admin123
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin' },
    update: { isAdmin: true, isVerified: true, passwordHash },
    create: {
      email: 'admin',
      passwordHash,
      firstName: 'Admin',
      lastName: '',
      isAdmin: true,
      isVerified: true,
    },
  });
  console.log('Admin user upserted:', admin.email, admin.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
