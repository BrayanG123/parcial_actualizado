import { PrismaClient } from '../../src/generated/prisma/client.js';
import { tenantIsolationExtension } from '../../src/database/prisma/tenant-isolation.extension.js';

/**
 * Cliente de prueba con el mismo aislamiento que PrismaService. Los fixtures que se
 * crean directamente (sin peticion HTTP) quedan en la empresa `fashionstore`, que
 * crea la migracion de multitenancy.
 */
export async function isolatedTestClient(
  base: PrismaClient,
  slug = 'fashionstore',
): Promise<PrismaClient> {
  const tenant = await base.tenant.findUniqueOrThrow({ where: { slug } });
  return base.$extends(
    tenantIsolationExtension({ fallbackTenantId: tenant.id }),
  ) as unknown as PrismaClient;
}
