import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedMassive } from './seeds/massive.js';

if (process.env.NODE_ENV === 'production')
  throw new Error('Massive seed is disabled in production');
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before running the massive seed');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    options: '-c timezone=UTC',
  }),
});

seedMassive(prisma, {
  referenceDate: process.env.SEED_MASSIVE_DATE,
  saltRounds: Number(process.env.PASSWORD_SALT_ROUNDS ?? 12),
})
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Massive seed failed',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
