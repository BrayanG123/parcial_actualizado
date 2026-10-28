import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';
import { seedTenantB, TENANT_B_SLUG } from '../prisma/seeds/tenant-b.js';
import { tenantContext } from '../src/common/tenant/tenant-context.js';
import { payloadHash } from '../src/modules/sync/sync.service.js';
import { SyncSalesService } from '../src/modules/sync/sync-sales.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Offline sync (HTTP + PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  let cashier: string;
  let customer: string;
  let shiftId: number;
  const deviceId = randomUUID();
  const http = () => request(ctx.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const variant = () => ({
    productId: ctx.product.id,
    sizeId: ctx.size.id,
    colorId: ctx.color.id,
  });
  const sale = (quantity = 2, unitPrice = 19.99, extra: object = {}) => ({
    operationId: randomUUID(),
    type: 'SALE_CASH',
    branchId: ctx.branch.id,
    createdAtLocal: new Date().toISOString(),
    payload: {
      shiftId,
      items: [{ ...variant(), quantity, unitPrice }],
      total: Math.round(quantity * unitPrice * 100) / 100,
      paymentMethod: 'CASH',
      cashReceived: 50,
    },
    ...extra,
  });
  const send = (operations: object[], token = cashier) =>
    http()
      .post('/api/v1/sync/operations')
      .set(auth(token))
      .send({ deviceId, operations })
      .expect(200);
  const stock = () =>
    ctx.prisma.inventory.findFirstOrThrow({
      where: { branchId: ctx.branch.id, ...variant() },
    });

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
    const role = await ctx.prisma.role.create({ data: { name: 'CASHIER' } });
    await ctx.prisma.user.create({
      data: {
        name: 'Cajero',
        email: 'cashier@sync.test',
        passwordHash: await hash('SyncPassword123!', 10),
        employee: { create: { branchId: ctx.branch.id, jobTitle: 'Cajero' } },
        roles: { create: { roleId: role.id } },
      },
    });
    cashier = (
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'cashier@sync.test', password: 'SyncPassword123!' })
        .expect(201)
    ).body.data.accessToken;
    customer = ctx.tokens[0]!;
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    shiftId = (
      await http()
        .post('/api/v1/cash/shifts')
        .set(auth(cashier))
        .send({
          registerId: register.id,
          openingCash: 100,
          openingKey: randomUUID(),
        })
        .expect(201)
    ).body.data.id;
  }, 60_000);
  afterAll(async () => ctx?.close());

  it('downloads the branch snapshot with prices, known stock and an open shift', async () => {
    const response = await http()
      .get('/api/v1/sync/snapshot')
      .set(auth(cashier))
      .expect(200);
    expect(response.body.data).toMatchObject({
      branch: { id: ctx.branch.id },
      openShift: { id: shiftId },
      tenant: { slug: 'fashionstore' },
    });
    expect(response.body.data.variants[0]).toMatchObject({
      productName: 'Camisa',
      netUnitPrice: 19.99,
      available: 10,
    });
    expect(response.body.data.version).toEqual(expect.any(String));
    await http()
      .get(`/api/v1/sync/snapshot?branchId=${ctx.otherBranch.id}`)
      .set(auth(cashier))
      .expect(403);
  });

  it('confirms an offline cash sale once: resending does not duplicate it', async () => {
    const before = await stock();
    const operation = sale(2);
    const first = await send([operation]);
    expect(first.body.data.results[0]).toMatchObject({
      operationId: operation.operationId,
      status: 'CONFIRMED',
      resourceType: 'SALE',
      attempts: 1,
    });
    const saleId = first.body.data.results[0].resourceId;
    const again = await send([operation]);
    expect(again.body.data.results[0]).toMatchObject({
      status: 'CONFIRMED',
      resourceId: saleId,
      attempts: 1,
    });
    expect((await stock()).physicalQuantity).toBe(before.physicalQuantity - 2);
    const created = await ctx.prisma.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { items: true, payments: true },
    });
    expect(created).toMatchObject({
      status: 'COMPLETED',
      channel: 'IN_STORE',
      shiftId,
      idempotencyKey: operation.operationId,
    });
    expect(created.payments[0]).toMatchObject({
      method: 'CASH',
      status: 'APPROVED',
    });
    expect(
      await ctx.prisma.inventoryMovement.count({
        where: { reference: `SALE:${saleId}` },
      }),
    ).toBe(1);
    const shift = await ctx.prisma.cashShift.findUniqueOrThrow({
      where: { id: shiftId },
    });
    expect(shift.saleCount).toBeGreaterThanOrEqual(1);
  });

  it('rejects the same operationId with different data without touching the original', async () => {
    const operation = sale(1);
    await send([operation]);
    const changed = {
      ...operation,
      payload: { ...operation.payload, cashReceived: 99 },
    };
    const result = (await send([changed])).body.data.results[0];
    expect(result).toMatchObject({
      status: 'REJECTED',
      code: 'OPERATION_ID_REUSED',
    });
    const stored = await ctx.prisma.syncOperation.findFirstOrThrow({
      where: { operationId: operation.operationId },
    });
    expect(stored.status).toBe('CONFIRMED');
  });

  it('reports conflicts with useful detail and confirms after they are resolved', async () => {
    const current = await stock();
    const tooMany = sale(current.physicalQuantity + 1);
    const result = (await send([tooMany])).body.data.results[0];
    expect(result).toMatchObject({
      status: 'CONFLICT',
      code: 'STOCK_INSUFFICIENT',
    });
    expect(result.detail.variants[0]).toMatchObject({
      requested: current.physicalQuantity + 1,
      available: current.physicalQuantity,
    });
    await ctx.prisma.inventory.update({
      where: { id: current.id },
      data: { physicalQuantity: current.physicalQuantity + 5 },
    });
    // Un conflicto no es final: el mismo operationId se reintenta.
    const retried = (await send([tooMany])).body.data.results[0];
    expect(retried).toMatchObject({ status: 'CONFIRMED', attempts: 2 });

    const price = (await send([sale(1, 15)])).body.data.results[0];
    expect(price).toMatchObject({ status: 'CONFLICT', code: 'PRICE_CHANGED' });
    expect(price.detail.variants[0]).toMatchObject({
      localUnitPrice: 15,
      currentUnitPrice: 19.99,
    });

    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: { active: false },
    });
    const inactive = (await send([sale(1)])).body.data.results[0];
    expect(inactive).toMatchObject({
      status: 'CONFLICT',
      code: 'PRODUCT_INACTIVE',
    });
    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: { active: true },
    });

    const otherBranch = sale(1, 19.99, { branchId: ctx.otherBranch.id });
    expect((await send([otherBranch])).body.data.results[0]).toMatchObject({
      status: 'CONFLICT',
      code: 'BRANCH_NOT_AUTHORIZED',
    });
    const badTotal = sale(1);
    badTotal.payload.total = 1;
    expect((await send([badTotal])).body.data.results[0]).toMatchObject({
      status: 'REJECTED',
      code: 'TOTAL_MISMATCH',
    });
    const invalid = sale(1);
    (invalid.payload as Record<string, unknown>).items = [];
    expect((await send([invalid])).body.data.results[0]).toMatchObject({
      status: 'REJECTED',
      code: 'INVALID_DATA',
    });
  });

  it('confirms an offline customer reservation idempotently and blocks wrong roles', async () => {
    const reservation = {
      operationId: randomUUID(),
      type: 'RESERVATION',
      branchId: ctx.branch.id,
      createdAtLocal: new Date().toISOString(),
      payload: {
        approximateTime: new Date(Date.now() + 86_400_000).toISOString(),
        items: [{ ...variant(), quantity: 1 }],
      },
      payloadHash: undefined as string | undefined,
    };
    reservation.payloadHash = payloadHash(reservation.payload);
    const first = (await send([reservation], customer)).body.data.results[0];
    expect(first).toMatchObject({
      status: 'CONFIRMED',
      resourceType: 'RESERVATION',
    });
    const second = (await send([reservation], customer)).body.data.results[0];
    expect(second.resourceId).toBe(first.resourceId);
    expect(
      await ctx.prisma.reservation.count({
        where: { operationKey: reservation.operationId },
      }),
    ).toBe(1);
    const past = {
      ...reservation,
      operationId: randomUUID(),
      payloadHash: undefined,
      payload: {
        ...reservation.payload,
        approximateTime: '2020-01-01T10:00:00Z',
      },
    };
    expect((await send([past], customer)).body.data.results[0]).toMatchObject({
      status: 'CONFLICT',
      code: 'RESERVATION_TIME_PASSED',
    });
    expect(
      (await send([sale(1)], customer)).body.data.results[0],
    ).toMatchObject({
      status: 'REJECTED',
      code: 'ROLE_NOT_ALLOWED',
    });
    const tampered = {
      ...reservation,
      operationId: randomUUID(),
      payloadHash: 'a'.repeat(64),
    };
    expect(
      (await send([tampered], customer)).body.data.results[0],
    ).toMatchObject({
      status: 'REJECTED',
      code: 'PAYLOAD_HASH_MISMATCH',
    });
  });

  it('keeps operations of each tenant apart', async () => {
    await tenantContext.runAsSystem(async () => {
      for (const name of ['BRANCH_MANAGER', 'SUPPLIER'] as const)
        await ctx.prisma.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
    });
    await seedTenantB(ctx.prisma, {
      password: 'TenantBPassword123!',
      saltRounds: 10,
    });
    const tenantB = await ctx.prisma.tenant.findUniqueOrThrow({
      where: { slug: TENANT_B_SLUG },
    });
    const cashierB = (
      await http()
        .post('/api/v1/auth/login')
        .set('X-Tenant', TENANT_B_SLUG)
        .send({
          email: 'cajero@empresa-b.test',
          password: 'TenantBPassword123!',
        })
        .expect(201)
    ).body.data.accessToken;
    // La operacion declara la empresa A con un token de B.
    const declared = sale(1, 19.99, { tenantId: 1 });
    expect(
      (await send([declared], cashierB)).body.data.results[0],
    ).toMatchObject({
      status: 'REJECTED',
      code: 'TENANT_MISMATCH',
    });
    // Un producto, turno o sucursal de A no existe para B.
    expect(
      (await send([sale(1)], cashierB)).body.data.results[0],
    ).toMatchObject({
      status: 'REJECTED',
      code: 'SHIFT_NOT_FOUND',
    });
    // El mismo operationId puede existir en dos empresas sin mezclarse.
    const shared = sale(1);
    await send([shared]);
    const inB = (await send([{ ...shared, branchId: 999999 }], cashierB)).body
      .data.results[0];
    expect(inB.status).not.toBe('CONFIRMED');
    expect(
      await tenantContext.runAsSystem(() =>
        ctx.prisma.syncOperation.count({
          where: { operationId: shared.operationId },
        }),
      ),
    ).toBe(2);
    const statusA = await http()
      .get(`/api/v1/sync/operations/${deviceId}?ids=${shared.operationId}`)
      .set(auth(cashierB))
      .expect(200);
    expect(
      statusA.body.data.every(
        (o: { status: string }) => o.status !== 'CONFIRMED',
      ),
    ).toBe(true);
    expect(tenantB.id).not.toBe(1);
  });

  it('turns every operation into SUBSCRIPTION_INVALID while read-only and keeps them retryable', async () => {
    await tenantContext.runAsSystem(() =>
      ctx.prisma.subscription.update({
        where: { tenantId: 1 },
        data: { status: 'SUSPENDED' },
      }),
    );
    const operation = sale(1);
    expect((await send([operation])).body.data.results[0]).toMatchObject({
      status: 'CONFLICT',
      code: 'SUBSCRIPTION_INVALID',
    });
    await tenantContext.runAsSystem(() =>
      ctx.prisma.subscription.update({
        where: { tenantId: 1 },
        data: { status: 'ACTIVE' },
      }),
    );
    expect((await send([operation])).body.data.results[0]).toMatchObject({
      status: 'CONFIRMED',
      attempts: 2,
    });
  });

  it('confirms tickets of a parcial 1 offline batch through /sync and lets the batch finish', async () => {
    const batchDevice = randomUUID();
    const batch = (
      await http()
        .post('/api/v1/sales/offline/prepare')
        .set(auth(cashier))
        .send({ id: randomUUID(), deviceId: batchDevice, shiftId })
        .expect(201)
    ).body.data;
    const net = batch.snapshot.variants[0].netUnitPrice as number;
    const ticket = sale(1, net);
    (ticket.payload as Record<string, unknown>).offlineBatchId = batch.id;
    const first = (await send([ticket])).body.data.results[0];
    expect(first).toMatchObject({ status: 'CONFIRMED', resourceType: 'SALE' });
    expect((await send([ticket])).body.data.results[0].resourceId).toBe(
      first.resourceId,
    );
    const created = await ctx.prisma.sale.findUniqueOrThrow({
      where: { id: first.resourceId },
    });
    expect(created.offlineBatchId).toBe(batch.id);
    await http()
      .post(`/api/v1/sales/offline/${batch.id}/finish`)
      .set(auth(cashier))
      .send({ deviceId: batchDevice, keys: [ticket.operationId] })
      .expect(201);
  });

  it('keeps an operation pending after a server error and confirms it on retry', async () => {
    const current = await stock();
    await ctx.prisma.inventory.update({
      where: { id: current.id },
      data: { physicalQuantity: current.reservedQuantity + 10 },
    });
    const service = ctx.app.get(SyncSalesService);
    const spy = vi
      .spyOn(service, 'confirm')
      .mockRejectedValueOnce(new Error('database connection lost'));
    const operation = sale(1);
    const failed = (await send([operation])).body.data.results[0];
    expect(failed).toMatchObject({
      status: 'ERROR',
      code: 'SERVER_ERROR',
      attempts: 1,
    });
    const stored = await ctx.prisma.syncOperation.findFirstOrThrow({
      where: { operationId: operation.operationId },
    });
    expect(stored.status).toBe('PROCESSING');
    spy.mockRestore();
    const retry = (await send([operation])).body.data.results[0];
    expect(retry).toMatchObject({
      status: 'CONFIRMED',
      attempts: 2,
    });
  });

  it('records each attempt in the sync log without payload and exposes it to admins', async () => {
    const admin = ctx.tokens[2]!;
    const logs = await http()
      .get('/api/v1/sync/logs?limit=100')
      .set(auth(admin))
      .expect(200);
    expect(logs.body.data.meta.total).toBeGreaterThan(5);
    const entry = logs.body.data.data[0];
    expect(entry).toEqual(
      expect.objectContaining({
        attempt: expect.any(Number),
        latencyMs: expect.any(Number),
      }),
    );
    expect(JSON.stringify(logs.body.data)).not.toContain('cashReceived');
    expect(logs.body.data.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'CONFIRMED' }),
      ]),
    );
    await http().get('/api/v1/sync/logs').set(auth(customer)).expect(403);
    const mine = await http()
      .get(`/api/v1/sync/operations/${deviceId}`)
      .set(auth(cashier))
      .expect(200);
    expect(mine.body.data.length).toBeGreaterThan(3);
  });
});
