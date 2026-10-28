import { hash } from 'bcrypt';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { tenantContext } from '../../src/common/tenant/tenant-context.js';
import { validateSeedPassword } from './base.js';

/** Administrador de la plataforma SaaS: usuario sin empresa con rol PLATFORM_ADMIN. */
export async function seedPlatformAdmin(
  client: PrismaClient,
  options: { email: string; password: string; saltRounds?: number },
) {
  const email = options.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Set a valid SEED_PLATFORM_ADMIN_EMAIL');
  validateSeedPassword(options.password, 'SEED_PLATFORM_ADMIN_PASSWORD');
  return tenantContext.runAsSystem(async () => {
    const role = await client.role.upsert({
      where: { name: 'PLATFORM_ADMIN' },
      update: {},
      create: {
        name: 'PLATFORM_ADMIN',
        description: 'Administra empresas, planes y suscripciones',
      },
    });
    const existing = await client.user.findFirst({
      where: { email, tenantId: null },
    });
    if (existing) return { created: false, id: existing.id };
    const user = await client.user.create({
      data: {
        tenantId: null,
        name: 'Administrador de plataforma',
        email,
        passwordHash: await hash(options.password, options.saltRounds ?? 12),
        roles: { create: { roleId: role.id } },
      },
    });
    return { created: true, id: user.id };
  });
}
