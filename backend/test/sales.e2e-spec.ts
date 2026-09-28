import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';
import { SalesService } from '../src/modules/sales/sales.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Sales and checkout (HTTP + PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  let sales: SalesService;
  let cashierToken: string;
  let shiftId: number;
  let otherCashierToken: string;
  const actor = (index = 0) => ctx.tokens[index];
  const auth = (token = actor()) => ({ Authorization: `Bearer ${token}` });
  const variant = (quantity = 1) => ({
    productId: ctx.product.id,
    sizeId: ctx.size.id,
    colorId: ctx.color.id,
    quantity,
  });
  const storeBody = (quantity = 1) => ({
    shiftId,
    idempotencyKey: randomUUID(),
    branchId: ctx.branch.id,
    items: [variant(quantity)],
    expectedTotal: Number((quantity * 19.99).toFixed(2)),
    paymentMethod: 'CASH',
  });
  const inStore = (body: object = storeBody(), token = cashierToken) =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/sales/in-store')
      .set(auth(token))
      .send(body);
  const stock = () =>
    ctx.prisma.inventory.findUniqueOrThrow({
      where: {
        branchId_productId_sizeId_colorId: {
          branchId: ctx.branch.id,
          productId: ctx.product.id,
          sizeId: ctx.size.id,
          colorId: ctx.color.id,
        },
      },
    });
  const addCart = (quantity = 1, token = actor()) =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send(variant(quantity));
  const preview = (cartId: number, token = actor(), branchId = ctx.branch.id) =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/sales/checkout/preview')
      .set(auth(token))
      .send({ cartId, branchId });
  const checkout = (body: object, token = actor()) =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/sales/checkout')
      .set(auth(token))
      .send(body);
  const cancel = (id: number, token = actor()) =>
    request(ctx.app.getHttpServer())
      .patch(`/api/v1/sales/${id}/cancel`)
      .set(auth(token));
  const prepareCheckout = async (quantity = 1, token = actor()) => {
    const cart = (await addCart(quantity, token).expect(201)).body.data;
    const quote = (await preview(cart.id, token).expect(201)).body.data;
    return {
      cartId: cart.id,
      branchId: ctx.branch.id,
      quoteHash: quote.quoteHash,
      channel: 'WEB',
      idempotencyKey: randomUUID(),
    };
  };

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
    sales = ctx.app.get(SalesService);
    const role = await ctx.prisma.role.create({ data: { name: 'CASHIER' } });
    const password = 'SalesTestPassword123!';
    const passwordHash = await hash(password, 10);
    const tokens: string[] = [];
    for (const [email, branchId] of [
      ['cashier@sales.test', ctx.branch.id],
      ['other-cashier@sales.test', ctx.otherBranch.id],
    ] as const) {
      await ctx.prisma.user.create({
        data: {
          name: 'Cajero',
          email,
          passwordHash,
          employee: { create: { branchId, jobTitle: 'Cajero' } },
          roles: { create: { roleId: role.id } },
        },
      });
      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(201);
      tokens.push(login.body.data.accessToken as string);
    }
    [cashierToken, otherCashierToken] = tokens;
  }, 60000);

  beforeEach(async () => {
    await ctx.prisma.payment.deleteMany();
    await ctx.prisma.saleItem.deleteMany();
    await ctx.prisma.sale.deleteMany();
    await ctx.prisma.offlineBatch.deleteMany();
    await ctx.prisma.cashShift.deleteMany();
    await ctx.prisma.reservationItem.deleteMany();
    await ctx.prisma.reservation.deleteMany();
    await ctx.prisma.cartItem.deleteMany();
    await ctx.prisma.cart.deleteMany();
    await ctx.prisma.inventoryMovement.deleteMany();
    await ctx.prisma.inventory.updateMany({
      data: { physicalQuantity: 10, reservedQuantity: 0 },
    });
    await ctx.prisma.branch.updateMany({ data: { active: true } });
    await ctx.prisma.client.updateMany({ data: { wholesale: false } });
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const shift = await request(ctx.app.getHttpServer())
      .post('/api/v1/cash/shifts')
      .set(auth(cashierToken))
      .send({
        registerId: register.id,
        openingCash: 100,
        openingKey: randomUUID(),
      })
      .expect(201);
    shiftId = shift.body.data.id;
    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: {
        name: 'Camisa',
        active: true,
        price: '19.99',
        discountPercent: 0,
        wholesalePrice: null,
        promotionStart: null,
        promotionEnd: null,
      },
    });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const currentShift = (token = cashierToken) =>
    request(ctx.app.getHttpServer())
      .get('/api/v1/cash/shifts/current')
      .set(auth(token));

  const deliveryData = {
    paymentOption: 'CASH_ON_DELIVERY',
    deliveryName: 'Ana Cliente',
    deliveryPhone: '76543210',
    deliveryAddress: 'La Paz, calle Central 123, puerta azul',
  };
  const deliver = (
    id: number,
    token = cashierToken,
    body = { shiftId, expectedTotal: 19.99 },
  ) =>
    request(ctx.app.getHttpServer())
      .post(`/api/v1/sales/${id}/deliver`)
      .set(auth(token))
      .send(body);

  it('holds COD stock without a Stripe deadline and collects cash once, even across retries and shift closure', async () => {
    const body = { ...(await prepareCheckout()), ...deliveryData };
    const sale = (await checkout(body).expect(201)).body.data;
    expect(sale).toMatchObject({
      cashOnDelivery: true,
      status: 'PENDING_PAYMENT',
      expiresAt: null,
      stockReserved: true,
      deliveryName: 'Ana Cliente',
    });
    expect(sale.payments[0]).toMatchObject({
      method: 'CASH',
      type: 'IN_STORE',
      status: 'PENDING',
    });
    expect((await checkout(body).expect(201)).body.data.id).toBe(sale.id);
    await checkout({ ...body, deliveryAddress: 'Otra direccion 999' }).expect(
      409,
    );
    await sales.expirePendingCheckouts();
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 1,
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/payments/stripe/intents')
      .set(auth())
      .send({ saleId: sale.id })
      .expect(404);
    await deliver(sale.id, actor()).expect(403);
    await deliver(sale.id, otherCashierToken).expect(403);
    await deliver(sale.id, cashierToken, { shiftId, expectedTotal: 1 }).expect(
      409,
    );
    const results = await Promise.all([deliver(sale.id), deliver(sale.id)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.data).toMatchObject({
      status: 'COMPLETED',
      stockReserved: false,
      shiftId,
    });
    expect(results[0].body.data.deliveredAt).toBeTruthy();
    expect(await stock()).toMatchObject({
      physicalQuantity: 9,
      reservedQuantity: 0,
    });
    expect((await currentShift()).body.data).toMatchObject({
      cashTotal: 19.99,
      saleCount: 1,
      expectedCash: 119.99,
    });
    await closeShift(shiftId, 119.99).expect(201);
    await deliver(sale.id).expect(201);
    await cancel(sale.id).expect(409);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/sales/${sale.id}/receipt`)
      .set(auth())
      .expect(200);
  });

  it('validates delivery data and restores all stock on cancellation without booking cash', async () => {
    const body = await prepareCheckout(2);
    for (const invalid of [
      { paymentOption: 'CASH_ON_DELIVERY' },
      { ...deliveryData, deliveryName: '  ' },
      { ...deliveryData, deliveryPhone: 'invalid' },
      { ...deliveryData, deliveryAddress: 'corta' },
      { paymentOption: null },
    ])
      await checkout({ ...body, ...invalid }).expect(400);
    expect(await ctx.prisma.sale.count()).toBe(0);
    const sale = (await checkout({ ...body, ...deliveryData }).expect(201)).body
      .data;
    await cancel(sale.id, actor(1)).expect(403);
    await cancel(sale.id).expect(200);
    await cancel(sale.id).expect(200);
    await deliver(sale.id, cashierToken, {
      shiftId,
      expectedTotal: 39.98,
    }).expect(409);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 0,
    });
    expect((await currentShift()).body.data).toMatchObject({
      cashTotal: 0,
      saleCount: 0,
    });
    expect(await ctx.prisma.payment.findFirst()).toMatchObject({
      status: 'VOIDED',
    });
  });

  it('requires an open online shift and rolls back COD stock and payment when collection fails', async () => {
    const sale = (
      await checkout({ ...(await prepareCheckout()), ...deliveryData }).expect(
        201,
      )
    ).body.data;
    const batchId = randomUUID();
    const deviceId = randomUUID();
    await request(ctx.app.getHttpServer())
      .post('/api/v1/sales/offline/prepare')
      .set(auth(cashierToken))
      .send({ id: batchId, deviceId, shiftId })
      .expect(201);
    await deliver(sale.id).expect(409);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/sales/offline/${batchId}/finish`)
      .set(auth(cashierToken))
      .send({ deviceId, keys: [] })
      .expect(201);
    await closeShift(shiftId, 100).expect(201);
    await deliver(sale.id).expect(409);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 1,
    });
    expect(await ctx.prisma.payment.findFirst()).toMatchObject({
      status: 'PENDING',
    });
  });

  it('serializes delivery against cancellation without losing stock or booking cash twice', async () => {
    const sale = (
      await checkout({ ...(await prepareCheckout()), ...deliveryData }).expect(
        201,
      )
    ).body.data;
    const responses = await Promise.all([deliver(sale.id), cancel(sale.id)]);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(1);
    const saved = await ctx.prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
    });
    const completed = saved.status === 'COMPLETED';
    expect(await stock()).toMatchObject({
      physicalQuantity: completed ? 9 : 10,
      reservedQuantity: 0,
    });
    expect((await currentShift()).body.data).toMatchObject({
      cashTotal: completed ? 19.99 : 0,
      saleCount: completed ? 1 : 0,
    });
  });
  const closeShift = (
    id: number,
    countedCash: number,
    note?: string,
    token = cashierToken,
  ) =>
    request(ctx.app.getHttpServer())
      .post(`/api/v1/cash/shifts/${id}/close`)
      .set(auth(token))
      .send({ countedCash, note });

  it('reconciles only cash plus opening balance, freezes the close and allows safe sale/close replays', async () => {
    const firstBody = storeBody();
    await inStore(firstBody).expect(201);
    for (const paymentMethod of ['CARD', 'QR', 'BANK_TRANSFER']) {
      await inStore({
        ...storeBody(),
        paymentMethod,
        paymentReference: `shift-${shiftId}-${paymentMethod}`,
      }).expect(201);
    }
    expect((await currentShift().expect(200)).body.data).toMatchObject({
      openingCash: 100,
      cashTotal: 19.99,
      cardTotal: 19.99,
      qrTotal: 19.99,
      transferTotal: 19.99,
      totalSales: 79.96,
      expectedCash: 119.99,
      saleCount: 4,
    });
    await closeShift(shiftId, 115).expect(400);
    const closed = (
      await closeShift(shiftId, 115, 'Faltante en conteo').expect(201)
    ).body.data;
    expect(closed).toMatchObject({
      countedCash: 115,
      difference: -4.99,
      expectedCash: 119.99,
      closingNote: 'Faltante en conteo',
    });
    expect(closed.closedAt).toBeTruthy();
    const replay = (
      await closeShift(shiftId, 115, 'Faltante en conteo').expect(201)
    ).body.data;
    expect(replay.closedAt).toBe(closed.closedAt);
    await closeShift(shiftId, 119.99).expect(409);
    await inStore(firstBody).expect(201);
    await inStore().expect(409);
    expect(await ctx.prisma.sale.count()).toBe(4);
    expect((await currentShift().expect(200)).body.data).toBeNull();
    const history = await request(ctx.app.getHttpServer())
      .get('/api/v1/cash/shifts')
      .set(auth(cashierToken))
      .expect(200);
    expect(history.body.data.data[0]).toMatchObject({
      saleCount: 4,
      difference: -4.99,
    });
  });

  it('requires the correct open shift and never attaches new sales to a previous or foreign shift', async () => {
    await inStore({ ...storeBody(), shiftId: undefined }).expect(400);
    await inStore({ ...storeBody(), shiftId: 2147483647 }).expect(409);
    await inStore(storeBody(), actor(2)).expect(409); // Same branch, another owner (admin).
    expect(await ctx.prisma.sale.count()).toBe(0);
    expect((await currentShift().expect(200)).body.data.saleCount).toBe(0);
    await closeShift(shiftId, 100).expect(201);
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const opened = await request(ctx.app.getHttpServer())
      .post('/api/v1/cash/shifts')
      .set(auth(cashierToken))
      .send({
        registerId: register.id,
        openingCash: 50,
        openingKey: randomUUID(),
      })
      .expect(201);
    await inStore().expect(409);
    await inStore({ ...storeBody(), shiftId: opened.body.data.id }).expect(201);
  });

  it('enforces register occupancy, own shifts and branch permissions, including histories', async () => {
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const opening = {
      registerId: register.id,
      openingCash: 0,
      openingKey: randomUUID(),
    };
    const open = (token: string) =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/cash/shifts')
        .set(auth(token))
        .send(opening);
    await open(actor()).expect(403);
    await open(otherCashierToken).expect(403);
    await open(actor(2)).expect(409);
    await open(cashierToken).expect(409);
    await closeShift(shiftId, 100, undefined, otherCashierToken).expect(404);
    await closeShift(shiftId, 100, undefined, actor(2)).expect(404);
    await request(ctx.app.getHttpServer())
      .get('/api/v1/cash/registers')
      .query({ branchId: ctx.branch.id })
      .set(auth(otherCashierToken))
      .expect(403);
    const otherHistory = await request(ctx.app.getHttpServer())
      .get('/api/v1/cash/shifts')
      .set(auth(otherCashierToken))
      .expect(200);
    expect(otherHistory.body.data.meta.total).toBe(0);
    await request(ctx.app.getHttpServer())
      .get('/api/v1/cash/shifts')
      .query({ branchId: ctx.branch.id })
      .set(auth(otherCashierToken))
      .expect(403);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/cash/registers')
      .set(auth(cashierToken))
      .send({ branchId: ctx.branch.id, name: 'Caja 2' })
      .expect(403);
    const extra = await request(ctx.app.getHttpServer())
      .post('/api/v1/cash/registers')
      .set(auth(actor(2)))
      .send({ branchId: ctx.branch.id, name: 'Caja 2' })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/cash/shifts')
      .set(auth(actor(2)))
      .send({ ...opening, registerId: extra.body.data.id })
      .expect(201);
    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/cash/shifts')
      .set(auth(cashierToken))
      .expect(200);
    expect(mine.body.data.meta.total).toBe(1);
    const all = await request(ctx.app.getHttpServer())
      .get('/api/v1/cash/shifts')
      .set(auth(actor(2)))
      .expect(200);
    expect(all.body.data.meta.total).toBe(2);
  });

  it('makes simultaneous opening and closing retries idempotent and does not reopen a replayed closed shift', async () => {
    await closeShift(shiftId, 100).expect(201);
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const opening = {
      registerId: register.id,
      openingCash: 0,
      openingKey: randomUUID(),
    };
    const open = (data = opening) =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/cash/shifts')
        .set(auth(cashierToken))
        .send(data);
    const opened = await Promise.all([open(), open()]);
    expect(opened.map((r) => r.status)).toEqual([201, 201]);
    const id = opened[0].body.data.id;
    expect(opened[1].body.data.id).toBe(id);
    await open({ ...opening, openingCash: 1 }).expect(409);
    const closed = await Promise.all([closeShift(id, 0), closeShift(id, 0)]);
    expect(closed.map((r) => r.status)).toEqual([201, 201]);
    expect((await open().expect(201)).body.data.closedAt).toBeTruthy();
    expect((await currentShift().expect(200)).body.data).toBeNull();
  });

  it('serializes a sale racing with close so every committed sale is included in the frozen reconciliation', async () => {
    const results = await Promise.all([
      inStore(),
      closeShift(shiftId, 100, 'Conteo simultaneo'),
    ]);
    expect(results[1].status).toBe(201);
    expect([201, 409]).toContain(results[0].status);
    const shift = await ctx.prisma.cashShift.findUniqueOrThrow({
      where: { id: shiftId },
    });
    const count = await ctx.prisma.sale.count();
    expect(shift.saleCount).toBe(count);
    expect(shift.cashTotal.toNumber()).toBe(count ? 19.99 : 0);
    expect((await stock()).physicalQuantity).toBe(count ? 9 : 10);
    await inStore().expect(409);
  });

  it('downloads server prices, synchronizes offline cash exactly once, and prevents close until finalization', async () => {
    const server = ctx.app.getHttpServer();
    const preparation = { id: randomUUID(), deviceId: randomUUID(), shiftId };
    const prepare = (body = preparation, token = cashierToken) =>
      request(server)
        .post('/api/v1/sales/offline/prepare')
        .set(auth(token))
        .send(body);
    await prepare(preparation, actor()).expect(403);
    await prepare(preparation, otherCashierToken).expect(404);
    const responses = await Promise.all([prepare(), prepare()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const batch = responses[0].body.data;
    expect(batch.snapshot.variants[0]).toMatchObject({
      unitPrice: 19.99,
      available: 10,
    });
    await prepare({
      ...preparation,
      id: randomUUID(),
      deviceId: randomUUID(),
    }).expect(409);
    await inStore().expect(409);
    await closeShift(shiftId, 100).expect(409);
    const body = {
      deviceId: preparation.deviceId,
      idempotencyKey: randomUUID(),
      recordedAt: new Date().toISOString(),
      expectedTotal: 39.98,
      items: [variant(2)],
    };
    const sync = (data = body, token = cashierToken) =>
      request(server)
        .post(`/api/v1/sales/offline/${batch.id}/sales`)
        .set(auth(token))
        .send(data);
    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: { price: 100, name: 'Nombre nuevo' },
    });
    await sync({ ...body, expectedTotal: 1 }).expect(409);
    await sync({ ...body, deviceId: randomUUID() }).expect(404);
    await sync(body, otherCashierToken).expect(404);
    const sold = await Promise.all([sync(), sync()]);
    expect(sold.map((r) => r.status)).toEqual([201, 201]);
    expect(sold[0].body.data.id).toBe(sold[1].body.data.id);
    expect(sold[0].body.data.items[0]).toMatchObject({
      productName: 'Camisa',
      unitPrice: 19.99,
    });
    expect(sold[0].body.data.soldAt).toBe(body.recordedAt);
    expect(await ctx.prisma.sale.count()).toBe(1);
    expect(await stock()).toMatchObject({ physicalQuantity: 8 });
    expect((await currentShift()).body.data).toMatchObject({
      saleCount: 1,
      cashTotal: 39.98,
      expectedCash: 139.98,
      offlineActive: true,
    });
    const finish = (keys: string[]) =>
      request(server)
        .post(`/api/v1/sales/offline/${batch.id}/finish`)
        .set(auth(cashierToken))
        .send({ deviceId: preparation.deviceId, keys });
    await finish([]).expect(409);
    await finish([body.idempotencyKey]).expect(201);
    await finish([body.idempotencyKey]).expect(201);
    await closeShift(shiftId, 139.98).expect(201);
    await sync().expect(201); // A lost response remains recoverable after finalization and close.
    await sync({ ...body, idempotencyKey: randomUUID() }).expect(409);
  });

  it('keeps stock conflicts atomic and retries the same offline ticket after inventory is corrected', async () => {
    const server = ctx.app.getHttpServer();
    const preparation = { id: randomUUID(), deviceId: randomUUID(), shiftId };
    const batch = (
      await request(server)
        .post('/api/v1/sales/offline/prepare')
        .set(auth(cashierToken))
        .send(preparation)
        .expect(201)
    ).body.data;
    const body = {
      deviceId: preparation.deviceId,
      idempotencyKey: randomUUID(),
      recordedAt: new Date().toISOString(),
      expectedTotal: 39.98,
      items: [variant(2)],
    };
    const sync = (data = body) =>
      request(server)
        .post(`/api/v1/sales/offline/${batch.id}/sales`)
        .set(auth(cashierToken))
        .send(data);
    await ctx.prisma.inventory.updateMany({
      where: { branchId: ctx.branch.id },
      data: { physicalQuantity: 1 },
    });
    await sync().expect(409);
    expect(await ctx.prisma.sale.count()).toBe(0);
    expect((await currentShift()).body.data.saleCount).toBe(0);
    await ctx.prisma.inventory.updateMany({
      where: { branchId: ctx.branch.id },
      data: { physicalQuantity: 10 },
    });
    await sync().expect(201);
    await sync({
      ...body,
      idempotencyKey: randomUUID(),
      items: [variant(9)],
      expectedTotal: 179.91,
    }).expect(409);
    await sync({
      ...body,
      idempotencyKey: randomUUID(),
      recordedAt: '2000-01-01T00:00:00.000Z',
    }).expect(400);
    expect(await ctx.prisma.sale.count()).toBe(1);
  });

  it('previews server prices without changing stock and limits POS customer lookup by role and branch', async () => {
    const clientId = ctx.users[0].client!.id;
    await ctx.prisma.client.update({
      where: { id: clientId },
      data: { wholesale: true },
    });
    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: { wholesalePrice: 15 },
    });
    const selection = {
      branchId: ctx.branch.id,
      clientId,
      items: [variant(2)],
    };
    const quoteRequest = (token: string, body: object = selection) =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/sales/in-store/preview')
        .set(auth(token))
        .send(body);
    const quote = (await quoteRequest(cashierToken).expect(201)).body.data;
    expect(quote).toMatchObject({
      total: 30,
      currency: 'BOB',
      wholesale: true,
      clientId,
    });
    expect(quote.items[0]).toMatchObject({
      quantity: 2,
      netUnitPrice: 15,
      subtotal: 30,
    });
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 0,
    });
    expect(await ctx.prisma.sale.count()).toBe(0);
    expect(await ctx.prisma.inventoryMovement.count()).toBe(0);
    await quoteRequest(actor()).expect(403);
    await quoteRequest(otherCashierToken).expect(403);
    await quoteRequest(cashierToken, {
      ...selection,
      items: [variant(11)],
    }).expect(409);
    await quoteRequest(cashierToken, { ...selection, total: 1 }).expect(400);
    const customers = (token: string, search = ctx.users[0].email) =>
      request(ctx.app.getHttpServer())
        .get('/api/v1/sales/in-store/customers')
        .query({ branchId: ctx.branch.id, search })
        .set(auth(token));
    const result = (await customers(cashierToken).expect(200)).body.data;
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: clientId,
      name: ctx.users[0].name,
      email: ctx.users[0].email,
      wholesale: true,
    });
    await customers(actor()).expect(403);
    await customers(otherCashierToken).expect(403);
    await customers(cashierToken, 'a').expect(400);
    // The same total used at preview is checked again at commit.
    await inStore({
      ...storeBody(2),
      clientId,
      expectedTotal: quote.total,
    }).expect(201);
  });

  it('records an in-store cash sale, payment, receipt and immutable price/name snapshots', async () => {
    const result = (await inStore(storeBody(2)).expect(201)).body.data;
    expect(result).toMatchObject({
      channel: 'IN_STORE',
      status: 'COMPLETED',
      total: 39.98,
      currency: 'BOB',
      stockReserved: false,
    });
    expect(result.payments[0]).toMatchObject({
      status: 'APPROVED',
      amount: 39.98,
      method: 'CASH',
    });
    expect(await stock()).toMatchObject({
      physicalQuantity: 8,
      reservedQuantity: 0,
    });
    expect(
      await ctx.prisma.inventoryMovement.count({ where: { type: 'SALE' } }),
    ).toBe(1);
    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: { name: 'New name', price: 999 },
    });
    const receipt = await request(ctx.app.getHttpServer())
      .get(`/api/v1/sales/${result.id}/receipt`)
      .set(auth(cashierToken))
      .expect(200);
    expect(receipt.body.data).toMatchObject({
      total: 39.98,
      receiptNumber: `FS-${String(result.id).padStart(8, '0')}`,
    });
    expect(receipt.body.data.items[0]).toMatchObject({
      productName: 'Camisa',
      unitPrice: 19.99,
    });
  });

  it('retries the same cash request without duplicating the sale and rejects altered payloads', async () => {
    const body = storeBody();
    const responses = await Promise.all([inStore(body), inStore(body)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.data.id).toBe(responses[1].body.data.id);
    expect(await ctx.prisma.sale.count()).toBe(1);
    expect(await stock()).toMatchObject({ physicalQuantity: 9 });
    await inStore({ ...body, expectedTotal: 1 }).expect(409);
  });

  it('requires correct totals and prevents partial writes when any item is unavailable', async () => {
    await inStore({ ...storeBody(), expectedTotal: 1 }).expect(409);
    const body = storeBody();
    body.items.push({ ...variant(11), sizeId: ctx.otherSize.id });
    body.expectedTotal = 239.88;
    await inStore(body).expect(409);
    expect(await ctx.prisma.sale.count()).toBe(0);
    expect(await ctx.prisma.payment.count()).toBe(0);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 0,
    });
  });

  it('enforces staff branches, customer ownership and prohibits client-approved payment routes', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/v1/sales/in-store')
      .send(storeBody())
      .expect(401);
    await inStore(storeBody(), actor()).expect(403);
    await inStore(storeBody(), otherCashierToken).expect(403);
    const order = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/sales/${order.id}`)
      .set(auth(actor(1)))
      .expect(403);
    await cancel(order.id, actor(1)).expect(403);
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/sales/${order.id}/confirm`)
      .set(auth())
      .send({ status: 'COMPLETED' })
      .expect(404);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/sales?branchId=${ctx.branch.id}`)
      .set(auth(otherCashierToken))
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/sales/${order.id}/receipt`)
      .set(auth())
      .expect(409);
  });

  it('creates a digital checkout with a snapshot, pending payment and stock hold, then confirms once', async () => {
    const body = await prepareCheckout(2);
    const order = (await checkout(body).expect(201)).body.data;
    expect(order).toMatchObject({
      status: 'PENDING_PAYMENT',
      cartId: body.cartId,
      stockReserved: true,
      total: 39.98,
    });
    expect(order.payments[0]).toMatchObject({
      method: 'GATEWAY',
      status: 'PENDING',
    });
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 2,
    });
    expect(
      await ctx.prisma.cart.findUnique({ where: { id: body.cartId } }),
    ).toMatchObject({ status: 'CONVERTED' });
    const confirmation = {
      reference: 'payment_success',
      amount: '39.98',
      currency: 'BOB',
    };
    const approvals = await Promise.all([
      sales.confirmElectronicPayment(order.id, confirmation),
      sales.confirmElectronicPayment(order.id, confirmation),
    ]);
    expect(approvals.every((sale) => sale.status === 'COMPLETED')).toBe(true);
    expect(await stock()).toMatchObject({
      physicalQuantity: 8,
      reservedQuantity: 0,
    });
    expect(
      await ctx.prisma.inventoryMovement.count({ where: { type: 'SALE' } }),
    ).toBe(1);
    expect(
      await ctx.prisma.payment.count({ where: { status: 'APPROVED' } }),
    ).toBe(1);
    await cancel(order.id).expect(409);
  });

  it('uses one order under concurrent checkout retries and rejects a second checkout of the converted cart', async () => {
    const body = await prepareCheckout();
    const responses = await Promise.all([checkout(body), checkout(body)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.data.id).toBe(responses[1].body.data.id);
    await checkout({ ...body, idempotencyKey: randomUUID() }).expect(404);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 1,
    });
  });

  it('requires a new preview when the cart or current prices changed', async () => {
    const body = await prepareCheckout();
    await ctx.prisma.product.update({
      where: { id: ctx.product.id },
      data: { price: 20 },
    });
    await checkout(body).expect(409);
    expect(await ctx.prisma.sale.count()).toBe(0);
    expect(
      await ctx.prisma.cart.findUnique({ where: { id: body.cartId } }),
    ).toMatchObject({ status: 'ACTIVE' });
    const newQuote = (await preview(body.cartId).expect(201)).body.data;
    await checkout({ ...body, quoteHash: newQuote.quoteHash }).expect(201);
  });

  it('validates the selected branch and rejects foreign carts and forged quote hashes', async () => {
    const body = await prepareCheckout();
    await preview(body.cartId, actor(1)).expect(404);
    await checkout({ ...body, quoteHash: '0'.repeat(64) }).expect(409);
    await checkout({ ...body, total: 0.01, status: 'COMPLETED' }).expect(400);
    await ctx.prisma.inventory.updateMany({
      where: { branchId: ctx.branch.id },
      data: { physicalQuantity: 0 },
    });
    await checkout(body).expect(409);
    expect(await ctx.prisma.sale.count()).toBe(0);
  });

  it('allows only one winner when checkout and an in-store sale compete for the last unit', async () => {
    const body = await prepareCheckout();
    await ctx.prisma.inventory.updateMany({
      where: { branchId: ctx.branch.id },
      data: { physicalQuantity: 1 },
    });
    const responses = await Promise.all([checkout(body), inStore()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const current = await stock();
    expect(current.physicalQuantity - current.reservedQuantity).toBe(0);
    expect(await ctx.prisma.sale.count()).toBe(1);
  });

  it('cancels pending orders concurrently, releasing exactly one hold', async () => {
    const order = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    const responses = await Promise.all([cancel(order.id), cancel(order.id)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 0,
    });
    expect(
      await ctx.prisma.inventoryMovement.count({
        where: { type: 'CHECKOUT_RELEASE' },
      }),
    ).toBe(1);
    expect(await ctx.prisma.payment.findFirst()).toMatchObject({
      status: 'VOIDED',
    });
  });

  it('expires unpaid checkouts once with multiple workers', async () => {
    const order = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    const afterDeadline = new Date(new Date(order.expiresAt).getTime() + 1);
    const counts = await Promise.all([
      sales.expirePendingCheckouts(afterDeadline),
      sales.expirePendingCheckouts(afterDeadline),
    ]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 0,
    });
    expect(
      await ctx.prisma.sale.findUnique({ where: { id: order.id } }),
    ).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'PAYMENT_WINDOW_EXPIRED',
    });
  });

  it('rejects wrong or late provider confirmations and commits expiration before reporting late payment', async () => {
    const order = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    await expect(
      sales.confirmElectronicPayment(order.id, {
        reference: 'wrong',
        amount: '1',
        currency: 'BOB',
      }),
    ).rejects.toThrow('does not match');
    await ctx.prisma.sale.update({
      where: { id: order.id },
      data: { expiresAt: new Date('2000-01-01') },
    });
    await expect(
      sales.confirmElectronicPayment(order.id, {
        reference: 'late',
        amount: '19.99',
        currency: 'BOB',
      }),
    ).rejects.toThrow('after expiration');
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 0,
    });
    expect(await ctx.prisma.payment.findFirst()).toMatchObject({
      status: 'VOIDED',
    });
  });

  it('converts part of a reservation, consuming purchased units and releasing the remainder', async () => {
    const reservation = await request(ctx.app.getHttpServer())
      .post('/api/v1/reservations')
      .set(auth())
      .send({
        branchId: ctx.branch.id,
        approximateTime: '2035-01-01T10:00:00-04:00',
        items: [variant(3), { ...variant(2), sizeId: ctx.otherSize.id }],
      })
      .expect(201);
    const reservationId = reservation.body.data.id;
    const loadReservation = (token = cashierToken, branchId = ctx.branch.id) =>
      request(ctx.app.getHttpServer())
        .get(`/api/v1/sales/in-store/reservations/${reservationId}`)
        .query({ branchId })
        .set(auth(token));
    await loadReservation().expect(409);
    for (const status of ['PREPARING', 'READY', 'CUSTOMER_PRESENT']) {
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/reservations/${reservationId}/status`)
        .set(auth(actor(2)))
        .send({ status })
        .expect(200);
    }
    const loaded = (await loadReservation().expect(200)).body.data;
    expect(loaded).toMatchObject({
      id: reservationId,
      branchId: ctx.branch.id,
      client: { id: ctx.users[0].client!.id },
    });
    expect(loaded.items).toHaveLength(2);
    await loadReservation(actor()).expect(403);
    await loadReservation(otherCashierToken).expect(403);
    await loadReservation(otherCashierToken, ctx.otherBranch.id).expect(404);
    const quote = await request(ctx.app.getHttpServer())
      .post('/api/v1/sales/in-store/preview')
      .set(auth(cashierToken))
      .send({ branchId: ctx.branch.id, reservationId, items: [variant(1)] })
      .expect(201);
    expect(quote.body.data.total).toBe(19.99);
    expect(await stock()).toMatchObject({
      physicalQuantity: 10,
      reservedQuantity: 3,
    });
    const body = { ...storeBody(1), reservationId };
    const order = (await inStore(body).expect(201)).body.data;
    expect(order.clientId).toBe(ctx.users[0].client!.id);
    expect(await stock()).toMatchObject({
      physicalQuantity: 9,
      reservedQuantity: 0,
    });
    const updated = await ctx.prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: { items: true },
    });
    expect(updated.status).toBe('COMPLETED');
    expect(
      updated.items.find((item) => item.sizeId === ctx.size.id),
    ).toMatchObject({ quantity: 3, purchasedQuantity: 1, status: 'PURCHASED' });
    expect(
      updated.items.find((item) => item.sizeId === ctx.otherSize.id),
    ).toMatchObject({ purchasedQuantity: 0, status: 'RETURNED' });
    expect(
      await ctx.prisma.inventoryMovement.count({
        where: { type: 'RESERVATION_RELEASE' },
      }),
    ).toBe(2);
    const replay = (await inStore(body).expect(201)).body.data;
    expect(replay.id).toBe(order.id);
    expect(await ctx.prisma.sale.count()).toBe(1);
    await loadReservation().expect(409);
    await inStore({ ...body, idempotencyKey: randomUUID() }).expect(409);
  });

  it('keeps customer histories separate and scopes cashier sales to their branch', async () => {
    await inStore({ ...storeBody(), clientId: ctx.users[0].client!.id }).expect(
      201,
    );
    const mine = await request(ctx.app.getHttpServer())
      .get('/api/v1/sales/mine')
      .set(auth())
      .expect(200);
    expect(mine.body.data.meta.total).toBe(1);
    const other = await request(ctx.app.getHttpServer())
      .get('/api/v1/sales/mine')
      .set(auth(actor(1)))
      .expect(200);
    expect(other.body.data.meta.total).toBe(0);
    const branch = await request(ctx.app.getHttpServer())
      .get('/api/v1/sales')
      .set(auth(otherCashierToken))
      .expect(200);
    expect(branch.body.data.meta.total).toBe(0);
  });

  it('resolves concurrent cancellation and payment without consuming or releasing a hold twice', async () => {
    const order = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    const results = await Promise.allSettled([
      sales.confirmElectronicPayment(order.id, {
        reference: 'race-payment',
        amount: '19.99',
        currency: 'BOB',
      }),
      cancel(order.id),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    const result = await ctx.prisma.sale.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(['COMPLETED', 'CANCELLED']).toContain(result.status);
    expect(await stock()).toMatchObject({
      physicalQuantity: result.status === 'COMPLETED' ? 9 : 10,
      reservedQuantity: 0,
    });
    expect(
      await ctx.prisma.inventoryMovement.count({
        where: { type: { in: ['SALE', 'CHECKOUT_RELEASE'] } },
      }),
    ).toBe(1);
  });

  it('does not apply the same provider transaction to two different orders', async () => {
    const first = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    const second = (await checkout(await prepareCheckout()).expect(201)).body
      .data;
    const confirmation = {
      reference: 'shared-provider-reference',
      amount: '19.99',
      currency: 'BOB',
    };
    await sales.confirmElectronicPayment(first.id, confirmation);
    await expect(
      sales.confirmElectronicPayment(second.id, confirmation),
    ).rejects.toThrow('duplicate payment');
    expect(await stock()).toMatchObject({
      physicalQuantity: 9,
      reservedQuantity: 1,
    });
    expect(
      await ctx.prisma.sale.findUnique({ where: { id: second.id } }),
    ).toMatchObject({ status: 'PENDING_PAYMENT' });
    expect(
      await ctx.prisma.inventoryMovement.count({ where: { type: 'SALE' } }),
    ).toBe(1);
  });
});
