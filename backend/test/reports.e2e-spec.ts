import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import { Prisma, SaleStatus } from '../src/generated/prisma/client.js';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Reports (HTTP and PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  let managerToken: string;
  const auth = (token = ctx.tokens[2]!) => ({
    Authorization: `Bearer ${token}`,
  });
  const get = (path: string, query: object = {}, token?: string) =>
    request(ctx.app.getHttpServer())
      .get('/api/v1/reports/' + path)
      .set(auth(token))
      .query(query);
  const period = { from: '2026-09-12', to: '2026-09-12' };
  const sale = (
    options: {
      branchId?: number;
      currency?: string;
      status?: SaleStatus;
      channel?: 'IN_STORE' | 'WEB' | 'MOBILE';
      amount?: string;
      quantity?: number;
      discount?: string;
      confirmedAt?: Date | null;
      soldAt?: Date;
    } = {},
  ) => {
    const quantity = options.quantity ?? 1;
    const unitPrice = new Prisma.Decimal(options.amount ?? '10');
    const discount = new Prisma.Decimal(options.discount ?? '0');
    return ctx.prisma.sale.create({
      data: {
        branchId: options.branchId ?? ctx.branch.id,
        currency: options.currency ?? 'BOB',
        status: options.status ?? 'COMPLETED',
        channel: options.channel ?? 'IN_STORE',
        soldAt: options.soldAt ?? new Date('2026-09-12T12:00:00Z'),
        confirmedAt:
          options.confirmedAt === undefined
            ? new Date('2026-09-12T12:00:00Z')
            : options.confirmedAt,
        total: unitPrice.minus(discount).mul(quantity),
        items: {
          create: {
            productId: ctx.product.id,
            sizeId: ctx.size.id,
            colorId: ctx.color.id,
            quantity,
            unitPrice,
            discount,
          },
        },
      },
    });
  };
  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
    const role = await ctx.prisma.role.create({
      data: { name: 'BRANCH_MANAGER' },
    });
    const password = 'ReportsManager123!';
    const user = await ctx.prisma.user.create({
      data: {
        name: 'Encargado',
        email: 'manager@reports.test',
        passwordHash: await hash(password, 10),
        roles: { create: { roleId: role.id } },
        employee: {
          create: { branchId: ctx.branch.id, jobTitle: 'Encargado' },
        },
      },
    });
    managerToken = (
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(201)
    ).body.data.accessToken;
  }, 30000);
  beforeEach(async () => {
    await ctx.prisma.payment.deleteMany();
    await ctx.prisma.sale.deleteMany();
    await ctx.prisma.cashShift.deleteMany();
    await ctx.prisma.reservation.deleteMany();
    await ctx.prisma.inventoryMovement.deleteMany();
    await ctx.prisma.inventory.updateMany({
      data: { physicalQuantity: 10, reservedQuantity: 0 },
    });
  });
  afterAll(async () => ctx?.close());

  it('counts completed sales once, separates currencies and uses discounted revenue', async () => {
    const first = await sale({ amount: '19.99', discount: '1', quantity: 2 });
    await ctx.prisma.payment.createMany({
      data: [
        {
          saleId: first.id,
          amount: 10,
          method: 'CASH',
          type: 'IN_STORE',
          status: 'APPROVED',
        },
        {
          saleId: first.id,
          amount: 27.98,
          method: 'CARD',
          type: 'IN_STORE',
          status: 'APPROVED',
        },
      ],
    });
    await sale({ channel: 'MOBILE' });
    await sale({
      branchId: ctx.otherBranch.id,
      currency: 'USD',
      channel: 'WEB',
    });
    await sale({ status: 'CANCELLED', amount: '1000' });
    await sale({ status: 'PENDING_PAYMENT', amount: '1000' });
    await sale({ status: 'REFUNDED', amount: '1000' });
    const data = (await get('sales', period).expect(200)).body.data;
    expect(data.totals).toEqual([
      {
        currency: 'BOB',
        saleCount: 2,
        unitsSold: 3,
        revenue: 47.98,
        averageTicket: 23.99,
      },
      {
        currency: 'USD',
        saleCount: 1,
        unitsSold: 1,
        revenue: 10,
        averageTicket: 10,
      },
    ]);
    expect(data.byBranch).toHaveLength(2);
    expect(data.byChannel).toHaveLength(3);
    expect(data.daily).toHaveLength(2);
  });

  it('filters by branch, channel and currency and ranks products per currency', async () => {
    await sale({ quantity: 3, amount: '19.99', discount: '1' });
    await sale({
      currency: 'USD',
      branchId: ctx.otherBranch.id,
      channel: 'WEB',
    });
    const data = (
      await get('sales', {
        ...period,
        branchId: ctx.otherBranch.id,
        channel: 'WEB',
        currency: 'USD',
      }).expect(200)
    ).body.data;
    expect(data.totals).toEqual([
      {
        currency: 'USD',
        saleCount: 1,
        unitsSold: 1,
        revenue: 10,
        averageTicket: 10,
      },
    ]);
    const ranked = (
      await get('top-products', { ...period, limit: 1 }).expect(200)
    ).body.data.items;
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      currency: 'BOB',
      unitsSold: 3,
      revenue: 56.97,
      rank: 1,
    });
  });

  it('uses local confirmation dates, the exclusive end boundary and legacy soldAt fallback', async () => {
    await sale({ confirmedAt: new Date('2026-09-12T03:59:59Z') });
    await sale({
      confirmedAt: new Date('2026-09-12T04:00:00Z'),
      soldAt: new Date('2026-09-01'),
    });
    await sale({ confirmedAt: new Date('2026-09-13T03:59:59Z') });
    await sale({ confirmedAt: new Date('2026-09-13T04:00:00Z') });
    await sale({ confirmedAt: null });
    const data = (await get('sales', period).expect(200)).body.data;
    expect(data.totals[0].saleCount).toBe(3);
    const storedDates = await ctx.prisma
      .$queryRaw`SELECT fecha_confirmacion::text AS actual, (COALESCE(fecha_confirmacion, fecha) AT TIME ZONE 'America/La_Paz')::date::text AS day FROM ventas ORDER BY id_venta`;
    expect(storedDates).toEqual([
      { actual: '2026-09-12 03:59:59+00', day: '2026-09-11' },
      { actual: '2026-09-12 04:00:00+00', day: '2026-09-12' },
      { actual: '2026-09-13 03:59:59+00', day: '2026-09-12' },
      { actual: '2026-09-13 04:00:00+00', day: '2026-09-13' },
      { actual: null, day: '2026-09-12' },
    ]);
    expect(data.daily).toEqual([
      {
        date: '2026-09-12',
        currency: 'BOB',
        saleCount: 3,
        unitsSold: 3,
        revenue: 30,
        averageTicket: 10,
      },
    ]);
  });

  it('groups completed sales by local hour', async () => {
    // 16:30Z y 16:59Z son las 12 en Bolivia; 23:10Z son las 19.
    await sale({ confirmedAt: new Date('2026-09-12T16:30:00Z') });
    await sale({ confirmedAt: new Date('2026-09-12T16:59:00Z') });
    await sale({ confirmedAt: new Date('2026-09-12T23:10:00Z') });
    await sale({
      status: 'CANCELLED',
      confirmedAt: new Date('2026-09-12T20:00:00Z'),
    });
    const data = (await get('sales', period).expect(200)).body.data;
    expect(
      data.hourly.map(
        (h: { hour: number; saleCount: number; revenue: number }) => [
          h.hour,
          h.saleCount,
          h.revenue,
        ],
      ),
    ).toEqual([
      [12, 2, 20],
      [19, 1, 10],
    ]);
  });

  it('reports cash shifts by register with payment methods, open shifts and cash differences', async () => {
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const otherRegister = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.otherBranch.id },
    });
    const shift = (
      data: Omit<
        Prisma.CashShiftCreateManyInput,
        'userId' | 'openingKey' | 'currency'
      >,
    ) => ({
      userId: ctx.users[2]!.id,
      openingKey: randomUUID(),
      currency: 'BOB',
      ...data,
    });
    await ctx.prisma.cashShift.createMany({
      data: [
        shift({
          registerId: register.id,
          openingCash: 100,
          cashTotal: 50,
          cardTotal: 20,
          qrTotal: 5,
          saleCount: 4,
          openedAt: new Date('2026-09-12T13:00:00Z'),
          closedAt: new Date('2026-09-12T22:00:00Z'),
          countedCash: 145,
        }),
        shift({
          registerId: register.id,
          openingCash: 50,
          cashTotal: 10,
          saleCount: 1,
          openedAt: new Date('2026-09-12T23:00:00Z'),
        }),
        shift({
          registerId: otherRegister.id,
          openingCash: 0,
          cardTotal: 30,
          saleCount: 1,
          openedAt: new Date('2026-09-12T15:00:00Z'),
          closedAt: new Date('2026-09-12T18:00:00Z'),
          countedCash: 0,
        }),
        shift({
          registerId: register.id,
          openingCash: 10,
          cashTotal: 999,
          openedAt: new Date('2026-09-14T15:00:00Z'),
          closedAt: new Date('2026-09-14T18:00:00Z'),
          countedCash: 1009,
        }),
      ],
    });

    const data = (await get('cash-shifts', period).expect(200)).body.data;
    expect(data.totals).toEqual([
      {
        currency: 'BOB',
        shiftCount: 3,
        openShifts: 1,
        saleCount: 6,
        cash: 60,
        card: 50,
        qr: 5,
        transfer: 0,
        total: 115,
        difference: -5,
        shiftsWithDifference: 1,
      },
    ]);
    expect(data.byRegister).toHaveLength(2);
    expect(data.shifts).toHaveLength(3);
    expect(data.shifts[0]).toMatchObject({
      registerName: 'Caja 1',
      branchName: ctx.branch.name,
      closedAt: null,
      expectedCash: 60,
      countedCash: null,
      difference: null,
    });

    const byRegister = (
      await get('cash-shifts', { ...period, registerId: register.id }).expect(
        200,
      )
    ).body.data;
    expect(byRegister.shifts).toHaveLength(2);
    const manager = (await get('cash-shifts', period, managerToken).expect(200))
      .body.data;
    expect(
      manager.byRegister.map((r: { branchId: number }) => r.branchId),
    ).toEqual([ctx.branch.id]);
    await get('cash-shifts', { registerId: 0 }).expect(400);
  });

  it('reports available/held/incoming stock and paginates the low stock subset', async () => {
    const inventories = await ctx.prisma.inventory.findMany({
      orderBy: { id: 'asc' },
    });
    await ctx.prisma.inventory.update({
      where: { id: inventories[0]!.id },
      data: { physicalQuantity: 4, reservedQuantity: 3 },
    });
    await ctx.prisma.inventory.update({
      where: { id: inventories[1]!.id },
      data: { physicalQuantity: 0 },
    });
    await ctx.prisma.inventoryMovement.createMany({
      data: [
        {
          inventoryId: inventories[0]!.id,
          type: 'PENDING_ENTRY',
          status: 'PENDING',
          quantity: 7,
        },
        {
          inventoryId: inventories[0]!.id,
          type: 'PENDING_ENTRY',
          status: 'COMPLETED',
          quantity: 20,
        },
      ],
    });
    const data = (
      await get('inventory', { lowStockOnly: 'true', limit: 1 }).expect(200)
    ).body.data;
    expect(data.summary).toEqual({
      variantCount: 2,
      physical: 4,
      reserved: 3,
      available: 1,
      incoming: 7,
      lowStockCount: 2,
      outOfStockCount: 1,
    });
    expect(data.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(data.items).toHaveLength(1);
    expect(data.items[0].available).toBe(0);
    const next = (
      await get('inventory', {
        lowStockOnly: 'true',
        limit: 1,
        page: 2,
      }).expect(200)
    ).body.data;
    expect(next.items[0].available).toBe(1);
  });

  it('reports reservation states by appointment date and branch', async () => {
    const clientId = ctx.users[0]!.client!.id;
    await ctx.prisma.reservation.createMany({
      data: [
        {
          clientId,
          branchId: ctx.branch.id,
          status: 'READY',
          approximateTime: new Date('2026-09-12T15:00:00Z'),
          expiresAt: new Date('2026-09-13T04:00:00Z'),
        },
        {
          clientId,
          branchId: ctx.otherBranch.id,
          status: 'CANCELLED',
          approximateTime: new Date('2026-09-12T15:00:00Z'),
          expiresAt: new Date('2026-09-13T04:00:00Z'),
        },
        {
          clientId,
          branchId: ctx.branch.id,
          status: 'PENDING',
          approximateTime: new Date('2026-09-15T15:00:00Z'),
          expiresAt: new Date('2026-09-16T04:00:00Z'),
        },
      ],
    });
    const data = (await get('reservations', period, managerToken).expect(200))
      .body.data;
    expect(data.items).toEqual([
      {
        branchId: ctx.branch.id,
        branchName: ctx.branch.name,
        status: 'READY',
        count: 1,
      },
    ]);
  });

  it('enforces JWT/roles and applies branch scope to every report', async () => {
    await sale({ branchId: ctx.otherBranch.id });
    await request(ctx.app.getHttpServer())
      .get('/api/v1/reports/sales')
      .expect(401);
    for (const path of [
      'sales',
      'top-products',
      'inventory',
      'reservations',
      'cash-shifts',
    ]) {
      await get(path, {}, ctx.tokens[0]).expect(403);
      await get(path, { branchId: ctx.otherBranch.id }, managerToken).expect(
        403,
      );
    }
    expect(
      (await get('sales', period, managerToken).expect(200)).body.data.totals,
    ).toEqual([]);
    expect(
      (
        await get('inventory', {}, managerToken).expect(200)
      ).body.data.byBranch.map((row: { branchId: number }) => row.branchId),
    ).toEqual([ctx.branch.id]);
  });

  it('validates ranges, pagination, boolean filters and unexpected parameters', async () => {
    for (const query of [
      { from: '2026-02-30' },
      { from: '2026-09-13', to: '2026-09-12' },
      { from: '2020-01-01', to: '2026-09-12' },
      { currency: "BOB'; DROP TABLE ventas;--" },
      { status: 'PENDING_PAYMENT' },
    ])
      await get('sales', query).expect(400);
    for (const query of [
      { lowStockOnly: 'maybe' },
      { page: 0 },
      { limit: 101 },
      { lowStockThreshold: -1 },
    ])
      await get('inventory', query).expect(400);
  });

  it('returns empty lists and zero inventory aggregates for empty filters', async () => {
    expect((await get('sales', period).expect(200)).body.data.totals).toEqual(
      [],
    );
    const data = (await get('inventory', { productId: 2147483647 }).expect(200))
      .body.data;
    expect(data.summary.variantCount).toBe(0);
    expect(data.summary.physical).toBe(0);
    expect(data.items).toEqual([]);
  });
});
