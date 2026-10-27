import { hash } from 'bcrypt';
import request from 'supertest';
import {
  AI_PROVIDER,
  AiUnavailableError,
  type AiJsonRequest,
} from '../src/modules/ai/providers/ai-provider.js';
import { cartTestContext } from './helpers/cart-test-context.js';
import { tenantContext } from '../src/common/tenant/tenant-context.js';

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

  describe('catalogo de reportes (F8)', () => {
    let pants: { id: number };
    type Body = {
      status: string;
      source: string;
      summary: string;
      suggestions?: string[];
      interpretation: Record<string, unknown> | null;
      table: {
        columns: { key: string }[];
        rows: Record<string, unknown>[];
      } | null;
      chart: { type: string; x?: string; y: { key: string }[] } | null;
    };
    const ask = async (question: string, token = ctx.tokens[2]!) =>
      (
        await request(server())
          .post('/api/v1/ai/reports')
          .set(auth(token))
          .send({ question })
          .expect(200)
      ).body.data as Body;
    const offline = () =>
      provider.generateJson.mockRejectedValue(new AiUnavailableError('off'));
    const sale = (
      branchId: number,
      productId: number,
      quantity: number,
      unitPrice: number,
      channel: 'IN_STORE' | 'WEB' = 'IN_STORE',
    ) =>
      ctx.prisma.sale.create({
        data: {
          branchId,
          channel,
          status: 'COMPLETED',
          total: quantity * unitPrice,
          confirmedAt: new Date(),
          items: {
            create: {
              productId,
              sizeId: ctx.size.id,
              colorId: ctx.color.id,
              quantity,
              unitPrice,
            },
          },
        },
      });

    beforeAll(async () => {
      pants = await ctx.prisma.product.create({
        data: {
          name: 'Pantalon',
          price: '50',
          category: { create: { name: 'Pantalones' } },
          season: { connect: { id: ctx.product.seasonId } },
          collection: { connect: { id: ctx.product.collectionId } },
          supplier: { connect: { id: ctx.product.supplierId! } },
        },
      });
      await ctx.prisma.inventory.create({
        data: {
          branchId: ctx.branch.id,
          productId: pants.id,
          sizeId: ctx.size.id,
          colorId: ctx.color.id,
          physicalQuantity: 1,
        },
      });
      // Central: 2 camisas (40) + 3 pantalones (150) web; Norte: 1 camisa (20).
      await sale(ctx.branch.id, ctx.product.id, 2, 20);
      await sale(ctx.branch.id, pants.id, 3, 50, 'WEB');
      await sale(ctx.otherBranch.id, ctx.product.id, 1, 20);

      // Otra empresa con una venta grande: nunca debe aparecer en los reportes de A.
      const other = await tenantContext.runAsSystem(() =>
        ctx.prisma.tenant.create({
          data: { slug: 'otra-ia', name: 'Otra IA' },
        }),
      );
      await tenantContext.runInTenant(other.id, async () => {
        const branch = await ctx.prisma.branch.create({
          data: { name: 'Central', city: 'La Paz', address: 'B' },
        });
        const [size, color] = await Promise.all([
          ctx.prisma.size.create({ data: { name: 'M' } }),
          ctx.prisma.color.create({
            data: { name: 'Azul', hexCode: '#0000FF' },
          }),
        ]);
        const season = await ctx.prisma.season.create({
          data: {
            name: 'B',
            startDate: new Date('2020-01-01'),
            endDate: new Date('2099-12-31'),
          },
        });
        const product = await ctx.prisma.product.create({
          data: {
            name: 'Camisa',
            price: '1000',
            category: { create: { name: 'Camisas' } },
            season: { connect: { id: season.id } },
            collection: { create: { name: 'B', seasonId: season.id } },
            supplier: { create: { name: 'Proveedor B' } },
          },
        });
        await ctx.prisma.sale.create({
          data: {
            branchId: branch.id,
            channel: 'IN_STORE',
            status: 'COMPLETED',
            total: 9000,
            confirmedAt: new Date(),
            items: {
              create: {
                productId: product.id,
                sizeId: size.id,
                colorId: color.id,
                quantity: 9,
                unitPrice: 1000,
              },
            },
          },
        });
      });
    }, 30000);

    it('resuelve los tipos del catalogo con reglas, tabla y grafico elegido', async () => {
      offline();
      const byBranch = await ask('ventas por sucursal de este mes');
      expect(byBranch).toMatchObject({
        status: 'OK',
        source: 'rules',
        interpretation: { report: 'sales-grouped', groupBy: 'branch' },
        chart: { type: 'bar', x: 'label', y: [{ key: 'revenue' }] },
      });
      expect(
        byBranch.table!.rows.map((r) => [r.label, r.revenue, r.unitsSold]),
      ).toEqual([
        ['Central', 190, 5],
        ['Norte', 20, 1],
      ]);
      expect(byBranch.summary).toContain('Central');

      const categories = await ask('categorias con mayores ingresos este mes');
      expect(categories.interpretation).toMatchObject({
        report: 'top-categories',
      });
      expect(categories.chart!.type).toBe('pie');
      expect(categories.table!.rows[0]).toMatchObject({
        categoryName: 'Pantalones',
        revenue: 150,
      });

      const weekly = await ask('ventas por semana de los ultimos 30 dias');
      expect(weekly.interpretation!.report).toBe('sales-by-week');
      expect(weekly.chart!.type).toBe('line');

      const comparison = await ask(
        'compara las sucursales en los ultimos 2 meses',
      );
      expect(comparison.interpretation).toMatchObject({
        report: 'branch-comparison',
        months: 2,
      });
      expect(comparison.table!.columns.map((c) => c.key)).toEqual(
        expect.arrayContaining([`b${ctx.branch.id}`, `b${ctx.otherBranch.id}`]),
      );
      expect(comparison.chart!.y).toHaveLength(2);

      const low = await ask('productos con menor existencia');
      expect(low.interpretation!.report).toBe('low-stock');
      expect(low.table!.rows[0]).toMatchObject({
        productName: 'Pantalon',
        available: 1,
      });
      expect(low.chart!.type).toBe('bar');

      const filtered = await ask(
        'top 5 productos mas vendidos de pantalones este mes',
      );
      expect(filtered.interpretation).toMatchObject({
        report: 'top-products',
        categoryIds: [expect.any(Number)],
        categoryNames: ['Pantalones'],
      });
      expect(filtered.table!.rows.map((r) => r.productName)).toEqual([
        'Pantalon',
      ]);

      const web = await ask('ventas por canal de este mes');
      expect(web.chart!.type).toBe('pie');
      expect(web.table!.rows.map((r) => r.label).sort()).toEqual([
        'En tienda',
        'Web',
      ]);
    });

    it('nunca mezcla datos de otra empresa', async () => {
      offline();
      const total = await ask('ventas por sucursal de este mes');
      expect(total.table!.rows.reduce((s, r) => s + Number(r.revenue), 0)).toBe(
        210,
      );
      const top = await ask('top 10 productos mas vendidos este mes');
      expect(top.table!.rows.every((r) => Number(r.revenue) < 1000)).toBe(true);
    });

    it('pide aclaracion o rechaza pedidos fuera del catalogo', async () => {
      offline();
      const vague = await ask('hola, que tal todo?');
      expect(vague).toMatchObject({
        status: 'NEEDS_CLARIFICATION',
        table: null,
        interpretation: null,
      });
      expect(vague.suggestions!.length).toBeGreaterThan(3);

      provider.generateJson.mockReset();
      responder();
      const write = await ask('elimina las ventas de ayer');
      expect(write.status).toBe('UNSUPPORTED');
      expect(write.summary).toContain('solo consultan');
      // El rechazo ocurre antes de enviar la solicitud al modelo.
      expect(provider.generateJson).not.toHaveBeenCalled();

      responder({ report: 'clarify', message: '¿De que periodo?' });
      expect(await ask('dame el reporte')).toMatchObject({
        status: 'NEEDS_CLARIFICATION',
        source: 'gemini',
        summary: '¿De que periodo?',
      });
    });

    it('filtra la salida del modelo y limita al encargado a su sucursal', async () => {
      responder({
        report: 'sales-grouped',
        groupBy: 'channel',
        branchIds: [ctx.branch.id, 999999],
        categoryIds: [123456],
        explanation: 'Canales de Central.',
      });
      const admin = await ask('ventas por canal en Central');
      expect(admin.interpretation).toMatchObject({
        branchIds: [ctx.branch.id],
        groupBy: 'channel',
      });
      expect(admin.interpretation!.categoryIds).toBeUndefined();

      responder({
        report: 'branch-comparison',
        branchIds: [ctx.branch.id, ctx.otherBranch.id],
        months: 1,
        explanation: 'Comparacion.',
      });
      const manager = await ask('compara Central y Norte', managerToken);
      expect(manager.interpretation).toMatchObject({
        branchIds: [ctx.branch.id],
      });
      expect(manager.interpretation!.explanation).toContain(
        'Se limito a tu sucursal',
      );
      expect(manager.table!.columns.map((c) => c.key)).not.toContain(
        `b${ctx.otherBranch.id}`,
      );
    });

    it('sigue respondiendo con la suscripcion vencida porque solo consulta', async () => {
      offline();
      const tenant = await ctx.prisma.tenant.findUniqueOrThrow({
        where: { slug: 'fashionstore' },
      });
      const expire = (endsAt: Date) =>
        tenantContext.runAsSystem(() =>
          ctx.prisma.subscription.update({
            where: { tenantId: tenant.id },
            data: { endsAt },
          }),
        );
      const { endsAt } = await expire(new Date(Date.now() - 1000));
      try {
        expect((await ask('ventas por sucursal de este mes')).status).toBe(
          'OK',
        );
      } finally {
        await expire(new Date(Date.now() + 365 * 86400000));
      }
      expect(endsAt.getTime()).toBeLessThan(Date.now());
    });
  });
});
