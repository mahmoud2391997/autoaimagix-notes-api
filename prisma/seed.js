import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { password } from '../src/modules/auth/schema.js';
try {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD)
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding');
  password.parse(env.ADMIN_PASSWORD);
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL },
    create: { email: env.ADMIN_EMAIL, passwordHash, role: 'ADMIN' },
    update: { passwordHash, role: 'ADMIN' },
  });
} finally {
  await prisma.$disconnect();
}
