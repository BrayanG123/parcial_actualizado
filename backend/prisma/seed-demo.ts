import 'dotenv/config';
import {
  DEFAULT_SEED_TENANT,
  createSeedClient,
  inTenant,
} from './seeds/tenant.js';
import { seedDemo } from './seeds/demo.js';

if (process.env.NODE_ENV === 'production')
  throw new Error('Demo seed is disabled in production');
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL before running the demo seed');
const prisma = createSeedClient(process.env.DATABASE_URL);
inTenant(prisma, DEFAULT_SEED_TENANT, () =>
  seedDemo(prisma, {
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? '',
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? '',
    demoPassword: process.env.SEED_DEMO_PASSWORD ?? '',
    referenceDate: process.env.SEED_DEMO_DATE,
    saltRounds: Number(process.env.PASSWORD_SALT_ROUNDS ?? 12),
  }),
)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Demo seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
