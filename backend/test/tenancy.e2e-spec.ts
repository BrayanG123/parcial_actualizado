import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';
import { seedTenantB, TENANT_B_SLUG } from '../prisma/seeds/tenant-b.js';
import { seedPlatformAdmin } from '../prisma/seeds/platform.js';
import { tenantContext } from '../src/common/tenant/tenant-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('SaaS multitenant (HTTP + PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const password = 'TenantBPassword123!';
  const platformPassword = 'PlatformPassword123!';
  let adminA: string;
  let adminB: string;
  let platform: string;
  let tenantBId: number;
  const http = () => request(ctx.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string, secret: string, slug?: string) => {
    const call = http().post('/api/v1/auth/login');
    if (slug) call.set('X-Tenant', slug);
    const response = await call.send({ email, password: secret }).expect(201);
    return response.body.data.accessToken as string;
  };

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
    await tenantContext.runAsSystem(async () => {
      for (const name of ['BRANCH_MANAGER', 'CASHIER', 'SUPPLIER'] as const)
        await ctx.prisma.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
    });
    await seedTenantB(ctx.prisma, { password, saltRounds: 10 });
    await seedPlatformAdmin(ctx.prisma, {
      email: 'platform@saas.test',
      password: platformPassword,
      saltRounds: 10,
    });
    tenantBId = (
      await ctx.prisma.tenant.findUniqueOrThrow({
        where: { slug: TENANT_B_SLUG },
      })
    ).id;
    adminA = ctx.tokens[2]!;
    adminB = await login('admin@empresa-b.test', password, TENANT_B_SLUG);
    platform = (
      await http()
        .post('/api/v1/platform/auth/login')
        .send({ email: 'platform@saas.test', password: platformPassword })
        .expect(200)
    ).body.data.accessToken;
  }, 60_000);
  afterAll(async () => ctx?.close());

  const productOfB = () =>
    tenantContext.runInTenant(tenantBId, () =>
      ctx.prisma.product.findFirstOrThrow({ orderBy: { id: 'asc' } }),
    );

  it('lists only the catalog of the tenant that is asked for', async () => {
    const own = await http().get('/api/v1/products?limit=50').expect(200);
    expect(own.body.data.data.map((p: { name: string }) => p.name)).toEqual([
      'Camisa',
    ]);
    const other = await http()
      .get('/api/v1/products?limit=50')
      .set('X-Tenant', TENANT_B_SLUG)
      .expect(200);
    expect(other.body.data.data).toHaveLength(4);
    expect(
      other.body.data.data.some((p: { name: string }) => p.name === 'Camisa'),
    ).toBe(false);
    await http()
      .get('/api/v1/products')
      .set('X-Tenant', 'no-existe')
      .expect(404);
  });

  it('answers 404 when a user reads, changes or deletes a resource of another tenant', async () => {
    const product = await productOfB();
    await http()
      .get(`/api/v1/products/${product.id}`)
      .set(bearer(adminA))
      .expect(404);
    await http()
      .patch(`/api/v1/products/${product.id}`)
      .set(bearer(adminA))
      .send({ name: 'Robado' })
      .expect(404);
    await http()
      .delete(`/api/v1/products/${product.id}`)
      .set(bearer(adminA))
      .expect(404);
    const branchB = await tenantContext.runInTenant(tenantBId, () =>
      ctx.prisma.branch.findFirstOrThrow(),
    );
    await http()
      .get(`/api/v1/branches/${branchB.id}`)
      .set(bearer(adminA))
      .expect(404);
    expect((await productOfB()).name).toBe(product.name);
    expect((await productOfB()).active).toBe(true);
  });

  it('rejects a session used against another tenant', async () => {
    const response = await http()
      .get('/api/v1/users')
      .set(bearer(adminA))
      .set('X-Tenant', TENANT_B_SLUG)
      .expect(403);
    expect(response.body.code).toBe('TENANT_MISMATCH');
  });

  it('limits reports and users to the tenant of the session', async () => {
    const reportA = await http()
      .get('/api/v1/reports/sales')
      .set(bearer(adminA))
      .expect(200);
    expect(reportA.body.data.totals).toEqual([]);
    const reportB = await http()
      .get('/api/v1/reports/sales')
      .set(bearer(adminB))
      .expect(200);
    expect(reportB.body.data.totals[0].saleCount).toBe(6);
    const users = await http()
      .get('/api/v1/users?limit=100')
      .set(bearer(adminB))
      .expect(200);
    expect(
      users.body.data.data.every((u: { email: string }) =>
        u.email.endsWith('@empresa-b.test'),
      ),
    ).toBe(true);
  });

  it('allows the same email in two tenants', async () => {
    await http()
      .post('/api/v1/auth/register')
      .set('X-Tenant', TENANT_B_SLUG)
      .send({
        name: 'Mismo correo',
        email: ctx.users[0]!.email,
        password: 'Password123',
      })
      .expect(201);
  });

  it('gates generative AI reports by plan', async () => {
    const blocked = await http()
      .post('/api/v1/ai/reports')
      .set(bearer(adminB))
      .send({ question: 'ventas por sucursal' })
      .expect(403);
    expect(blocked.body.code).toBe('PLAN_FEATURE_REQUIRED');
    await http()
      .post('/api/v1/ai/reports')
      .set(bearer(adminA))
      .send({ question: 'ventas por sucursal' })
      .expect(200);
  });

  it('enforces the active branch limit of the plan', async () => {
    const response = await http()
      .post('/api/v1/branches')
      .set(bearer(adminB))
      .send({ name: 'Sur', city: 'La Paz', address: 'Av. Sur 123' })
      .expect(403);
    expect(response.body.code).toBe('PLAN_LIMIT_REACHED');
    const usage = await http()
      .get('/api/v1/tenant/subscription')
      .set(bearer(adminB))
      .expect(200);
    expect(usage.body.data).toMatchObject({
      plan: {
        code: 'BASIC',
        maxActiveBranches: 2,
        features: { aiReports: false },
      },
      usage: { activeBranches: 2, remainingBranches: 0 },
      readOnly: false,
    });
  });

  it('keeps an expired tenant in read-only mode', async () => {
    await tenantContext.runAsSystem(() =>
      ctx.prisma.subscription.update({
        where: { tenantId: tenantBId },
        data: { endsAt: new Date(Date.now() - 1000) },
      }),
    );
    const write = await http()
      .post('/api/v1/branches')
      .set(bearer(adminB))
      .send({ name: 'Sur', city: 'La Paz', address: 'Av. Sur 123' })
      .expect(403);
    expect(write.body.code).toBe('SUBSCRIPTION_READ_ONLY');
    await http().get('/api/v1/branches').set(bearer(adminB)).expect(200);
    // El login sigue permitido para consultar.
    await login('admin@empresa-b.test', password, TENANT_B_SLUG);
    const status = await http()
      .get('/api/v1/tenant/subscription')
      .set(bearer(adminB))
      .expect(200);
    expect(status.body.data).toMatchObject({
      subscription: { status: 'EXPIRED' },
      readOnly: true,
    });
    // La empresa A no se ve afectada.
    await http()
      .post('/api/v1/branches')
      .set(bearer(adminA))
      .send({ name: 'Sur', city: 'La Paz', address: 'Av. Sur 123' })
      .expect(201);
    const renewed = await http()
      .post(`/api/v1/platform/tenants/${tenantBId}/subscription/renew`)
      .set(bearer(platform))
      .send({ months: 1 })
      .expect(200);
    expect(renewed.body.data.subscription.status).toBe('ACTIVE');
    const history = await http()
      .get(`/api/v1/platform/tenants/${tenantBId}/subscription/history`)
      .set(bearer(platform))
      .expect(200);
    expect(history.body.data.map((h: { action: string }) => h.action)).toEqual([
      'RENEW',
      'EXPIRE',
      'ASSIGN',
    ]);
  });

  it('lets the platform admin register tenants and change plans within limits', async () => {
    const created = await http()
      .post('/api/v1/platform/tenants')
      .set(bearer(platform))
      .send({
        name: 'Empresa C',
        slug: 'empresa-c',
        planCode: 'BASIC',
        admin: {
          name: 'Admin C',
          email: 'admin@empresa-c.test',
          password: 'Password123',
        },
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      slug: 'empresa-c',
      subscription: { status: 'ACTIVE', plan: { code: 'BASIC' } },
      usage: { activeBranches: 0, users: 1 },
    });
    await http()
      .post('/api/v1/platform/tenants')
      .set(bearer(platform))
      .send({
        name: 'Duplicada',
        slug: 'empresa-c',
        planCode: 'BASIC',
        admin: {
          name: 'Admin X',
          email: 'x@c.test',
          password: 'Password123',
        },
      })
      .expect(409);
    const adminC = await login(
      'admin@empresa-c.test',
      'Password123',
      'empresa-c',
    );
    const products = await http()
      .get('/api/v1/products')
      .set(bearer(adminC))
      .expect(200);
    expect(products.body.data.data).toEqual([]);
    // A tiene 3 sucursales activas (2 del fixture + 1 creada arriba): no cabe en Basico.
    const tooSmall = await http()
      .patch('/api/v1/platform/tenants/1/subscription/plan')
      .set(bearer(platform))
      .send({ planCode: 'BASIC' })
      .expect(409);
    expect(tooSmall.body.code).toBe('PLAN_LIMIT_EXCEEDED');
    const upgraded = await http()
      .patch(
        `/api/v1/platform/tenants/${created.body.data.id}/subscription/plan`,
      )
      .set(bearer(platform))
      .send({ planCode: 'PROFESSIONAL' })
      .expect(200);
    expect(upgraded.body.data.subscription.plan.code).toBe('PROFESSIONAL');
  });

  it('keeps platform and business permissions apart', async () => {
    await http().get('/api/v1/users').set(bearer(platform)).expect(403);
    await http()
      .get('/api/v1/platform/tenants')
      .set(bearer(adminA))
      .expect(403);
    await http()
      .post('/api/v1/users')
      .set(bearer(adminA))
      .send({
        name: 'Escalada',
        email: 'escalada@cart.test',
        password: 'Password123',
        roles: ['PLATFORM_ADMIN'],
      })
      .expect(400);
  });
});
