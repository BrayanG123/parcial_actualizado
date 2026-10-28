import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { tenantContext } from '../../src/common/tenant/tenant-context.js';
import { tenantIsolationExtension } from '../../src/database/prisma/tenant-isolation.extension.js';

/** Cliente de seed con el mismo aislamiento por empresa que usa el backend. */
export function createSeedClient(
  databaseUrl: string | undefined,
): PrismaClient {
  if (!databaseUrl) throw new Error('Set DATABASE_URL before running the seed');
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      options: '-c timezone=UTC',
    }),
  });
  return client.$extends(tenantIsolationExtension()) as unknown as PrismaClient;
}

export const DEFAULT_SEED_TENANT = 'fashionstore';

/** Ejecuta `callback` dentro de la empresa `slug` (la migracion crea `fashionstore`). */
export async function inTenant<T>(
  client: PrismaClient,
  slug: string,
  callback: (tenantId: number) => Promise<T>,
): Promise<T> {
  const tenant = await client.tenant.findUnique({ where: { slug } });
  if (!tenant)
    throw new Error(
      `Tenant ${slug} not found; run prisma migrate deploy first`,
    );
  return tenantContext.runInTenant(tenant.id, () => callback(tenant.id));
}

/** Empresa actual dentro de `inTenant`. */
export const seedTenantId = () => tenantContext.requireTenantId();
