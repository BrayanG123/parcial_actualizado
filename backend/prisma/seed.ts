import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedBase } from './seeds/base.js';

if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before running the seed');
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    options: '-c timezone=UTC',
  }),
});
seedBase(prisma, {
  adminEmail: process.env.SEED_ADMIN_EMAIL ?? '',
  adminPassword: process.env.SEED_ADMIN_PASSWORD ?? '',
  saltRounds: Number(process.env.PASSWORD_SALT_ROUNDS ?? 12),
})
  .then(() =>
    console.log(
      'Base seed completed. Existing passwords and stock were preserved.',
    ),
  )
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Base seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
