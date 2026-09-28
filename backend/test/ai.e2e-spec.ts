import { hash } from 'bcrypt';
import request from 'supertest';
import {
  AI_PROVIDER,
  AiUnavailableError,
  type AiJsonRequest,
} from '../src/modules/ai/providers/ai-provider.js';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
// El limite por IP se prueba en unidad; aqui no debe interferir entre casos.
process.env.AI_REQUESTS_PER_MINUTE = '1000';

describe.skipIf(!databaseUrl)('AI (HTTP and PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  let managerToken: string;
  const provider = {
    name: 'gemini' as const,
    model: 'fake-model',
    isConfigured: () => true,
    generateJson: vi.fn<(request: AiJsonRequest) => Promise<unknown>>(),
  };
  const server = () => ctx.app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  /** Respuesta falsa segun la instruccion de sistema de cada funcion. */
  const responder = (
    intent: object = { report: 'sales', explanation: 'Ventas.' },
  ) =>
    provider.generateJson.mockImplementation(async ({ system }) => {
      if (system.includes('Conviertes solicitudes')) return intent;
      if (system.includes('analista')) return { summary: 'Resumen IA' };
      if (system.includes('recomendador'))
        return { items: [{ productId: ctx.product.id, reason: 'Motivo IA' }] };
      return {
        reply: 'Te sugiero la camisa.',
        productIds: [ctx.product.id, 999999],
      };
    });

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!, undefined, (builder) =>
      builder.overrideProvider(AI_PROVIDER).useValue(provider),
    );
    const role = await ctx.prisma.role.create({
      data: { name: 'BRANCH_MANAGER' },
    });
    const password = 'AiManagerTest123!';
    const manager = await ctx.prisma.user.create({
      data: {
        name: 'Encargado IA',
        email: 'manager@ai.test',
        passwordHash: await hash(password, 10),
        roles: { create: { roleId: role.id } },
        employee: {
          create: { branchId: ctx.branch.id, jobTitle: 'Encargado' },
        },
      },
    });
    managerToken = (
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: manager.email, password })
        .expect(201)
    ).body.data.accessToken;
  }, 30000);
  beforeEach(() => {
    provider.generateJson.mockReset();
    responder();
  });
  afterAll(async () => ctx?.close());

  it('exposes the provider status without secrets', async () => {
    const body = (await request(server()).get('/api/v1/ai/status').expect(200))
      .body.data;
    expect(body).toEqual({
      provider: 'gemini',
      model: 'fake-model',
      configured: true,
    });
  });

  it('answers with stocked catalog products only and falls back to rules', async () => {
    await request(server())
      .post('/api/v1/ai/assistant')
      .send({ message: '' })
      .expect(400);
    const answer = (
      await request(server())
        .post('/api/v1/ai/assistant')
        .send({
          message: 'Busco una camisa',
          history: [{ role: 'user', text: 'hola' }],
        })
        .expect(200)
    ).body.data;
    expect(answer).toMatchObject({
      reply: 'Te sugiero la camisa.',
      source: 'gemini',
    });
    expect(answer.products.map((p: { id: number }) => p.id)).toEqual([
      ctx.product.id,
    ]);

    provider.generateJson.mockRejectedValue(new AiUnavailableError('timeout'));
    const fallback = (
      await request(server())
        .post('/api/v1/ai/assistant')
        .send({ message: 'camisa' })
        .expect(200)
    ).body.data;
    expect(fallback.source).toBe('rules');
    expect(fallback.products[0].id).toBe(ctx.product.id);
  });

  it('personalizes and stores recommendations only for customers', async () => {
    const anonymous = (
      await request(server())
        .get('/api/v1/ai/recommendations?limit=2')
        .expect(200)
    ).body.data;
    expect(anonymous[0]).toMatchObject({
      id: null,
      productId: ctx.product.id,
      reason: 'Motivo IA',
    });
    expect(await ctx.prisma.aiRecommendation.count()).toBe(0);

    const customer = (
      await request(server())
        .get('/api/v1/ai/recommendations?limit=2&context=oficina')
        .set(auth(ctx.tokens[0]!))
        .expect(200)
    ).body.data;
    expect(customer[0]).toMatchObject({
      source: 'gemini:fake-model',
      product: { id: ctx.product.id },
    });
    expect(customer[0].id).toEqual(expect.any(Number));
    expect(
      await ctx.prisma.aiRecommendation.count({
        where: { clientId: ctx.users[0]!.client!.id },
      }),
    ).toBe(1);
    await request(server())
      .get('/api/v1/ai/recommendations?limit=50')
      .expect(400);
  });

  it('builds generative reports from whitelisted filters with role and branch scope', async () => {
    await request(server())
      .post('/api/v1/ai/reports')
      .send({ question: 'ventas' })
      .expect(401);
    await request(server())
      .post('/api/v1/ai/reports')
      .set(auth(ctx.tokens[0]!))
      .send({ question: 'ventas' })
      .expect(403);

    const admin = (
      await request(server())
        .post('/api/v1/ai/reports')
        .set(auth(ctx.tokens[2]!))
        .send({ question: 'ventas de hoy' })
        .expect(200)
    ).body.data;
    expect(admin).toMatchObject({
      source: 'gemini',
      summary: 'Resumen IA',
      interpretation: { report: 'sales' },
    });
    expect(admin.result.totals).toEqual([]);
    expect(admin.result.hourly).toEqual([]);

    responder({
      report: 'sales',
      branchId: ctx.otherBranch.id,
      explanation: 'Ventas del Norte.',
    });
    const manager = (
      await request(server())
        .post('/api/v1/ai/reports')
        .set(auth(managerToken))
        .send({ question: 'ventas del Norte' })
        .expect(200)
    ).body.data;
    expect(manager.interpretation.branchId).toBe(ctx.branch.id);
    expect(manager.interpretation.explanation).toContain(
      'Se limito a tu sucursal',
    );

    responder({ report: 'cash-shifts', explanation: 'Turnos.' });
    const shifts = (
      await request(server())
        .post('/api/v1/ai/reports')
        .set(auth(ctx.tokens[2]!))
        .send({ question: 'arqueo de cajas' })
        .expect(200)
    ).body.data;
    expect(shifts.interpretation.report).toBe('cash-shifts');
    expect(shifts.result).toMatchObject({
      totals: [],
      byRegister: [],
      shifts: [],
    });

    responder({ report: 'DROP TABLE ventas' });
    const rules = (
      await request(server())
        .post('/api/v1/ai/reports')
        .set(auth(ctx.tokens[2]!))
        .send({ question: 'inventario agotado' })
        .expect(200)
    ).body.data;
    expect(rules).toMatchObject({
      source: 'rules',
      interpretation: { report: 'inventory', lowStockOnly: true },
    });
  });
});
