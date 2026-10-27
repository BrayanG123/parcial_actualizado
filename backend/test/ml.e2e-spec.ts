import { hash } from 'bcrypt';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { tenantContext } from '../src/common/tenant/tenant-context.js';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const TOKEN = 'token-interno-de-prueba-123';

interface Call {
  method: string;
  url: string;
  token?: string;
  body: Record<string, unknown> | null;
}

/** Servicio de ML falso: registra las llamadas y responde segun el modo configurado. */
function fakeMlService() {
  const calls: Call[] = [];
  let mode: 'ok' | 'untrained' | 'down' = 'ok';
  const read = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
    });
  const server: Server = createServer(async (req, res) => {
    const raw = await read(req);
    calls.push({
      method: req.method!,
      url: req.url!,
      token: req.headers['x-internal-token'] as string | undefined,
      body: raw ? JSON.parse(raw) : null,
    });
    if (mode === 'down') return req.socket.destroy();
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers['x-internal-token'] !== TOKEN)
      return send(401, { code: 'INVALID_INTERNAL_TOKEN', message: 'x' });
    if (mode === 'untrained')
      return send(404, {
        code: 'MODEL_NOT_TRAINED',
        message: 'detalle interno',
      });
    const path = req.url!.replace(/^\/v1\/tenants\/\d+/, '');
    const trained = { status: 'TRAINED', metrics: {} };
    if (path === '/train' || path === '/metrics')
      return send(200, {
        source: 'synthetic',
        trainedAt: '2026-10-27T00:00:00+00:00',
        asOf: '2026-10-27',
        salesRows: 10,
        transactions: 5,
        parts: { demand: trained, segmentation: trained, anomalies: trained },
      });
    if (path === '/forecast')
      return send(200, {
        horizon: 2,
        lastObservedWeek: '2026-10-19',
        series: 2,
        totals: [{ week: '2026-10-26', units: 10, low: 8, high: 12 }],
        top: [
          {
            productId: fixtures.productId,
            branchId: fixtures.branchId,
            units: 6,
            weeks: [],
          },
        ],
        interval: 'p10-p90',
      });
    if (path === '/segments')
      return send(200, {
        summary: [{ segment: 'VIP', customers: 3 }],
        metrics: { chosenK: 3 },
      });
    if (path.startsWith('/anomalies'))
      return send(200, {
        metrics: { model: 'IsolationForest' },
        flagged: [
          {
            branchId: fixtures.branchId,
            week: '2026-01-05',
            units: 1,
            expected: 9,
            kind: 'drop',
            score: -0.7,
          },
          {
            branchId: fixtures.otherBranchId,
            week: '2026-02-02',
            units: 30,
            expected: 9,
            kind: 'spike',
            score: -0.7,
          },
        ],
        series: [],
      });
    return send(404, { code: 'NOT_FOUND' });
  });
  const fixtures = { productId: 0, branchId: 0, otherBranchId: 0 };
  return { server, calls, fixtures, setMode: (m: typeof mode) => (mode = m) };
}

describe.skipIf(!databaseUrl)(
  'ML (HTTP, PostgreSQL y servicio interno)',
  () => {
    let ctx: Awaited<ReturnType<typeof cartTestContext>>;
    const fake = fakeMlService();
    let managerToken: string;
    let tenantId: number;
    const server = () => ctx.app.getHttpServer();
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const admin = () => ctx.tokens[2]!;

    beforeAll(async () => {
      await new Promise<void>((resolve) =>
        fake.server.listen(0, '127.0.0.1', resolve),
      );
      process.env.ML_SERVICE_URL = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
      process.env.ML_SERVICE_TOKEN = TOKEN;
      ctx = await cartTestContext(databaseUrl!);
      Object.assign(fake.fixtures, {
        productId: ctx.product.id,
        branchId: ctx.branch.id,
        otherBranchId: ctx.otherBranch.id,
      });
      tenantId = (
        await ctx.prisma.tenant.findUniqueOrThrow({
          where: { slug: 'fashionstore' },
        })
      ).id;
      const role = await ctx.prisma.role.create({
        data: { name: 'BRANCH_MANAGER' },
      });
      const password = 'MlManagerTest123!';
      const manager = await ctx.prisma.user.create({
        data: {
          name: 'Encargado ML',
          email: 'manager@ml.test',
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
      fake.calls.length = 0;
      fake.setMode('ok');
    });
    afterAll(async () => {
      await ctx?.close();
      fake.server.close();
      delete process.env.ML_SERVICE_URL;
      delete process.env.ML_SERVICE_TOKEN;
    });

    it('exige sesion, rol y plan con mlAnalytics', async () => {
      await request(server()).get('/api/v1/ml/dashboard').expect(401);
      await request(server())
        .get('/api/v1/ml/dashboard')
        .set(auth(ctx.tokens[0]!))
        .expect(403);
      await request(server())
        .post('/api/v1/ml/train')
        .set(auth(managerToken))
        .send({ source: 'synthetic' })
        .expect(403);
      await request(server())
        .post('/api/v1/ml/train')
        .set(auth(admin()))
        .send({ source: 'sql' })
        .expect(400);

      const basic = await tenantContext.runAsSystem(() =>
        ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'BASIC' } }),
      );
      const sub = await tenantContext.runAsSystem(() =>
        ctx.prisma.subscription.findUniqueOrThrow({ where: { tenantId } }),
      );
      await tenantContext.runAsSystem(() =>
        ctx.prisma.subscription.update({
          where: { tenantId },
          data: { planId: basic.id },
        }),
      );
      try {
        const blocked = await request(server())
          .get('/api/v1/ml/dashboard')
          .set(auth(admin()))
          .expect(403);
        expect(blocked.body.code).toBe('PLAN_FEATURE_REQUIRED');
      } finally {
        await tenantContext.runAsSystem(() =>
          ctx.prisma.subscription.update({
            where: { tenantId },
            data: { planId: sub.planId },
          }),
        );
      }
      expect(fake.calls).toHaveLength(0);
    });

    it('entrena con la forma del catalogo de la empresa y el token interno', async () => {
      const res = await request(server())
        .post('/api/v1/ml/train')
        .set(auth(admin()))
        .send({ source: 'synthetic' })
        .expect(200);
      expect(res.body.data.parts.demand.status).toBe('TRAINED');
      const [call] = fake.calls;
      expect(call).toMatchObject({
        method: 'POST',
        url: `/v1/tenants/${tenantId}/train`,
        token: TOKEN,
      });
      const body = call!.body as {
        source: string;
        seed: number;
        catalog: {
          branches: { id: number }[];
          products: { id: number; price: number }[];
        };
      };
      expect(body).toMatchObject({ source: 'synthetic', seed: 42 });
      expect(body.catalog.branches.map((b) => b.id).sort()).toEqual(
        [ctx.branch.id, ctx.otherBranch.id].sort(),
      );
      expect(body.catalog.products).toEqual([
        expect.objectContaining({ id: ctx.product.id, price: 19.99 }),
      ]);
    });

    it('con datos reales envia agregados sin datos personales', async () => {
      const empty = await request(server())
        .post('/api/v1/ml/train')
        .set(auth(admin()))
        .send({ source: 'real' })
        .expect(422);
      expect(empty.body.code).toBe('ML_INSUFFICIENT_DATA');
      expect(fake.calls).toHaveLength(0);

      const client = await ctx.prisma.client.findFirstOrThrow();
      await ctx.prisma.sale.create({
        data: {
          branchId: ctx.branch.id,
          clientId: client.id,
          channel: 'IN_STORE',
          status: 'COMPLETED',
          total: 40,
          confirmedAt: new Date(),
          items: {
            create: {
              productId: ctx.product.id,
              sizeId: ctx.size.id,
              colorId: ctx.color.id,
              quantity: 2,
              unitPrice: 20,
            },
          },
        },
      });
      await request(server())
        .post('/api/v1/ml/train')
        .set(auth(admin()))
        .send({ source: 'real' })
        .expect(200);
      const body = fake.calls[0]!.body as {
        source: string;
        sales: Record<string, unknown>[];
        transactions: Record<string, unknown>[];
      };
      expect(body.source).toBe('provided');
      expect(body.sales).toEqual([
        expect.objectContaining({
          productId: ctx.product.id,
          branchId: ctx.branch.id,
          units: 2,
          price: 20,
        }),
      ]);
      expect(body.transactions).toHaveLength(1);
      expect(Object.keys(body.transactions[0]!).sort()).toEqual([
        'amount',
        'customerId',
        'date',
      ]);
      // Sin correos ni nombres de clientes: solo el id interno.
      expect(JSON.stringify(body)).not.toMatch(/@cart\.test|"name"/);
    });

    it('el encargado solo ve su sucursal y no puede pedir otra', async () => {
      const res = await request(server())
        .get('/api/v1/ml/dashboard?horizon=2')
        .set(auth(managerToken))
        .expect(200);
      const forecast = fake.calls.find((c) => c.url.endsWith('/forecast'))!;
      expect(forecast.body).toMatchObject({
        horizon: 2,
        branchIds: [ctx.branch.id],
      });
      expect(res.body.data.forecast.top[0]).toMatchObject({
        productName: 'Camisa',
        branchName: 'Central',
      });
      expect(
        res.body.data.anomalies.flagged.map(
          (a: { branchId: number }) => a.branchId,
        ),
      ).toEqual([ctx.branch.id]);
      expect(res.body.data.scope).toEqual(['Central']);
      await request(server())
        .get(`/api/v1/ml/dashboard?branchId=${ctx.otherBranch.id}`)
        .set(auth(managerToken))
        .expect(403);
      const adminView = await request(server())
        .get('/api/v1/ml/dashboard')
        .set(auth(admin()))
        .expect(200);
      expect(adminView.body.data.anomalies.flagged).toHaveLength(2);
    });

    it('traduce los errores del servicio sin exponer su detalle', async () => {
      fake.setMode('untrained');
      const untrained = await request(server())
        .get('/api/v1/ml/dashboard')
        .set(auth(admin()))
        .expect(200);
      expect(untrained.body.data).toEqual({ trained: false });
      const train = await request(server())
        .post('/api/v1/ml/train')
        .set(auth(admin()))
        .send({ source: 'synthetic' })
        .expect(409);
      expect(JSON.stringify(train.body)).not.toContain('detalle interno');

      fake.setMode('down');
      const down = await request(server())
        .get('/api/v1/ml/dashboard')
        .set(auth(admin()))
        .expect(503);
      expect(down.body.code).toBe('ML_UNAVAILABLE');
    });
  },
);
