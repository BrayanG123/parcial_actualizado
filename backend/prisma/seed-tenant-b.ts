import 'dotenv/config';
import { createSeedClient } from './seeds/tenant.js';
import { seedPlatformAdmin } from './seeds/platform.js';
import { seedTenantB } from './seeds/tenant-b.js';

if (process.env.NODE_ENV === 'production')
  throw new Error('Tenant B demo seed is disabled in production');
const prisma = createSeedClient(process.env.DATABASE_URL);
const saltRounds = Number(process.env.PASSWORD_SALT_ROUNDS ?? 12);

async function main() {
  const tenantB = await seedTenantB(prisma, {
    password: process.env.SEED_DEMO_PASSWORD ?? '',
    saltRounds,
    referenceDate: process.env.SEED_DEMO_DATE,
  });
  const platform = process.env.SEED_PLATFORM_ADMIN_EMAIL
    ? await seedPlatformAdmin(prisma, {
        email: process.env.SEED_PLATFORM_ADMIN_EMAIL,
        password: process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? '',
        saltRounds,
      })
    : { skipped: 'SEED_PLATFORM_ADMIN_EMAIL not set' };
  console.log(JSON.stringify({ tenantB, platform }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Tenant B seed failed',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
