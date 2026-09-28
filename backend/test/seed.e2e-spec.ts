import request from 'supertest';
import { seedBase } from '../prisma/seeds/base.js';
import { seedDemo } from '../prisma/seeds/demo.js';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Repeatable demo seed (PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const options = {
    adminEmail: 'admin@cart.test',
    adminPassword: 'DifferentAdminPassword123!',
    demoPassword: 'DemoFixturePassword123!',
    saltRounds: 10,
    referenceDate: '2026-09-12',
  };
  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
  }, 30000);
  afterAll(async () => ctx?.close());

  it('populates coherent data, authenticates demo users and can be repeated without resetting anything', async () => {
    const oldAdmin = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: options.adminEmail },
    });
    const result = await seedDemo(ctx.prisma, options);
    expect(result).toMatchObject({
      created: true,
      completedSales: 30,
      otherSales: 3,
      employees: 6,
      customers: 4,
      notificationsAdded: 7,
    });
    expect(await ctx.prisma.sale.count()).toBe(33);
    expect(await ctx.prisma.reservation.count()).toBe(7);
    expect(await ctx.prisma.notification.count()).toBe(7);
    const notice = await ctx.prisma.notification.findFirstOrThrow();
    const receipt = await ctx.prisma.notificationRead.create({
      data: { notificationId: notice.id, userId: oldAdmin.id },
    });
    expect(
      (
        await ctx.prisma.user.findUniqueOrThrow({
          where: { email: options.adminEmail },
        })
      ).passwordHash,
    ).toBe(oldAdmin.passwordHash);
    expect(
      await ctx.prisma.payment.count({
        where: { stripeIntentId: { not: null } },
      }),
    ).toBe(0);
    const stocks = await ctx.prisma.inventory.findMany();
    expect(
      stocks.every(
        (row) =>
          row.reservedQuantity >= 0 &&
          row.physicalQuantity >= row.reservedQuantity,
      ),
    ).toBe(true);
    expect(stocks.reduce((sum, row) => sum + row.reservedQuantity, 0)).toBe(9);
    const sales = await ctx.prisma.sale.findMany({
      include: { items: true, payments: true },
    });
    for (const sale of sales) {
      expect(
        sale.items.reduce(
          (sum, item) =>
            sum +
            item.unitPrice.minus(item.discount).mul(item.quantity).toNumber(),
          0,
        ),
      ).toBeCloseTo(sale.total.toNumber(), 2);
      expect(sale.payments[0]!.amount.equals(sale.total)).toBe(true);
    }
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'encargado1@demo.fashionstore.test',
        password: options.demoPassword,
      })
      .expect(201);
    const report = await request(ctx.app.getHttpServer())
      .get('/api/v1/reports/sales')
      .set('Authorization', 'Bearer ' + login.body.data.accessToken)
      .query({ from: '2026-08-14', to: '2026-09-12' })
      .expect(200);
    expect(report.body.data.byBranch).toHaveLength(1);
    const modified = stocks.find(
      (row) => row.physicalQuantity > row.reservedQuantity + 2,
    )!;
    await ctx.prisma.inventory.update({
      where: { id: modified.id },
      data: { physicalQuantity: { decrement: 1 } },
    });
    const before = {
      users: await ctx.prisma.user.count(),
      sales: await ctx.prisma.sale.count(),
      movements: await ctx.prisma.inventoryMovement.count(),
      stocks: await ctx.prisma.inventory.findMany({ orderBy: { id: 'asc' } }),
    };
    expect(
      await seedDemo(ctx.prisma, {
        ...options,
        demoPassword: 'AnotherDemoPassword123!',
      }),
    ).toMatchObject({ created: false, notificationsAdded: 0 });
    expect(await ctx.prisma.notification.count()).toBe(7);
    expect(await ctx.prisma.notificationRead.findMany()).toEqual([receipt]);
    await seedBase(ctx.prisma, options);
    expect({
      users: await ctx.prisma.user.count(),
      sales: await ctx.prisma.sale.count(),
      movements: await ctx.prisma.inventoryMovement.count(),
      stocks: await ctx.prisma.inventory.findMany({ orderBy: { id: 'asc' } }),
    }).toEqual(before);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'cliente1@demo.fashionstore.test',
        password: options.demoPassword,
      })
      .expect(201);
  }, 60000);

  it('does not promote an existing customer to administrator', async () => {
    const email = ctx.users[0]!.email;
    await expect(
      seedBase(ctx.prisma, { ...options, adminEmail: email }),
    ).rejects.toThrow('non-administrator');
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    expect(user.roles.map(({ role }) => role.name)).toEqual(['CUSTOMER']);
  });

  it('adds missing notices to an older demo without replaying stock or sales', async () => {
    const stock = await ctx.prisma.inventory.findMany({
      orderBy: { id: 'asc' },
    });
    const sales = await ctx.prisma.sale.count();
    const notice = await ctx.prisma.notification.findFirstOrThrow({
      where: { reads: { none: {} } },
    });
    await ctx.prisma.notification.delete({ where: { id: notice.id } });
    expect(await seedDemo(ctx.prisma, options)).toMatchObject({
      created: false,
      notificationsAdded: 1,
    });
    expect(await ctx.prisma.notification.count()).toBe(7);
    expect(await ctx.prisma.notificationRead.count()).toBe(1);
    expect(await ctx.prisma.sale.count()).toBe(sales);
    expect(
      await ctx.prisma.inventory.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(stock);
  });

  it('rejects invalid demo inputs before creating records', async () => {
    const before = await ctx.prisma.user.count();
    await expect(
      seedDemo(ctx.prisma, { ...options, demoPassword: '' }),
    ).rejects.toThrow('SEED_DEMO_PASSWORD');
    await expect(
      seedDemo(ctx.prisma, { ...options, referenceDate: '2026-02-30' }),
    ).rejects.toThrow('SEED_DEMO_DATE');
    expect(await ctx.prisma.user.count()).toBe(before);
  });
});
