import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

/**
 * Cupo offline: la ultima prenda no se vende dos veces. La caja A aparta la unica unidad
 * libre antes de quedarse sin conexion; la caja B (tambien offline) y la tienda en linea
 * ya no pueden venderla; la venta de A se confirma al sincronizar.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Offline quota (HTTP + PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const cajero = { token: '', shiftId: 0, device: randomUUID() };
  const otro = { token: '', shiftId: 0, device: randomUUID() };
  const http = () => request(ctx.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const variant = () => ({
    productId: ctx.product.id,
    sizeId: ctx.size.id,
    colorId: ctx.color.id,
  });
  const stock = () =>
    ctx.prisma.inventory.findFirstOrThrow({
      where: { branchId: ctx.branch.id, ...variant() },
    });
  const sale = (caja: typeof cajero, quantity = 1, unitPrice = 19.99) => ({
    operationId: randomUUID(),
    type: 'SALE_CASH',
    branchId: ctx.branch.id,
    createdAtLocal: new Date().toISOString(),
    payload: {
      shiftId: caja.shiftId,
      items: [{ ...variant(), quantity, unitPrice }],
      total: Math.round(quantity * unitPrice * 100) / 100,
      paymentMethod: 'CASH',
    },
  });
  const send = (caja: typeof cajero, operations: object[], device = caja.device) =>
    http()
      .post('/api/v1/sync/operations')
      .set(auth(caja.token))
      .send({ deviceId: device, operations })
      .expect(200);

  async function cajeroNuevo(email: string, caja: typeof cajero, registro: string) {
    const role =
      (await ctx.prisma.role.findFirst({ where: { name: 'CASHIER' } })) ??
      (await ctx.prisma.role.create({ data: { name: 'CASHIER' } }));
    await ctx.prisma.user.create({
      data: {
        name: email,
        email,
        passwordHash: await hash('QuotaPassword123!', 10),
        employee: { create: { branchId: ctx.branch.id, jobTitle: 'Cajero' } },
        roles: { create: { roleId: role.id } },
      },
    });
    caja.token = (
      await http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'QuotaPassword123!' })
        .expect(201)
    ).body.data.accessToken;
    const register =
      (await ctx.prisma.cashRegister.findFirst({
        where: { branchId: ctx.branch.id, name: registro },
      })) ??
      (await ctx.prisma.cashRegister.create({
        data: { branchId: ctx.branch.id, name: registro, tenantId: ctx.branch.tenantId },
      }));
    caja.shiftId = (
      await http()
        .post('/api/v1/cash/shifts')
        .set(auth(caja.token))
        .send({ registerId: register.id, openingCash: 0, openingKey: randomUUID() })
        .expect(201)
    ).body.data.id;
  }

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
    await cajeroNuevo('caja-a@quota.test', cajero, 'Caja 1');
    await cajeroNuevo('caja-b@quota.test', otro, 'Caja 2');
  }, 60_000);
  afterAll(async () => ctx?.close());

  it('reserves the last unit for one register so no one else can sell it', async () => {
    // Solo queda una unidad libre de la variante.
    const inicial = await stock();
    await ctx.prisma.inventory.update({
      where: { id: inicial.id },
      data: { physicalQuantity: inicial.reservedQuantity + 1 },
    });
    const base = await stock();

    const apartado = await http()
      .post('/api/v1/sync/quota')
      .set(auth(cajero.token))
      .send({ deviceId: cajero.device })
      .expect(201);
    const data = apartado.body.data;
    expect(data.quota).toMatchObject({ id: expect.any(Number), units: expect.any(Number) });
    expect(data.variants.find((v: { productId: number }) => v.productId === ctx.product.id))
      .toMatchObject({ available: 1 });
    expect((await stock()).reservedQuantity).toBe(base.reservedQuantity + 1);

    // La otra caja ve 0 disponibles y, si igual vende offline, queda en conflicto.
    const otraDescarga = await http()
      .get(`/api/v1/sync/snapshot?deviceId=${otro.device}`)
      .set(auth(otro.token))
      .expect(200);
    expect(
      otraDescarga.body.data.variants.find((v: { productId: number }) => v.productId === ctx.product.id),
    ).toMatchObject({ available: 0 });
    const ventaOtra = await send(otro, [sale(otro)]);
    expect(ventaOtra.body.data.results[0]).toMatchObject({
      status: 'CONFLICT',
      code: 'STOCK_INSUFFICIENT',
    });

    // Otro dispositivo de la misma caja no usa el cupo.
    const desdeOtroEquipo = await send(cajero, [sale(cajero)], randomUUID());
    expect(desdeOtroEquipo.body.data.results[0]).toMatchObject({ status: 'CONFLICT' });

    // La caja con el cupo confirma su venta offline y consume lo apartado.
    const propia = await send(cajero, [sale(cajero)]);
    expect(propia.body.data.results[0]).toMatchObject({ status: 'CONFIRMED' });
    const despues = await stock();
    expect(despues.physicalQuantity).toBe(base.physicalQuantity - 1);
    expect(despues.reservedQuantity).toBe(base.reservedQuantity);
    const item = await ctx.prisma.offlineQuotaItem.findFirstOrThrow({
      where: { quotaId: data.quota.id, inventoryId: base.id },
    });
    expect(item).toMatchObject({ allocated: 1, used: 1 });
  });

  it('returns unsold units to free stock when released or when the shift closes', async () => {
    const actual = await stock();
    await ctx.prisma.inventory.update({
      where: { id: actual.id },
      data: { physicalQuantity: actual.reservedQuantity + 5 },
    });
    const base = await stock();

    const primero = await http()
      .post('/api/v1/sync/quota')
      .set(auth(cajero.token))
      .send({ deviceId: cajero.device, perVariant: 2 })
      .expect(201);
    expect((await stock()).reservedQuantity).toBe(base.reservedQuantity + 2);

    // Liberar devuelve lo no vendido; la descarga vuelve a mostrar el stock libre.
    const liberado = await http()
      .post(`/api/v1/sync/quota/${primero.body.data.quota.id}/release`)
      .set(auth(cajero.token))
      .send({ deviceId: cajero.device })
      .expect(200);
    expect(liberado.body.data.quota).toBeNull();
    expect((await stock()).reservedQuantity).toBe(base.reservedQuantity);

    // Otra caja no puede liberar un cupo ajeno.
    const segundo = await http()
      .post('/api/v1/sync/quota')
      .set(auth(cajero.token))
      .send({ deviceId: cajero.device, perVariant: 3 })
      .expect(201);
    await http()
      .post(`/api/v1/sync/quota/${segundo.body.data.quota.id}/release`)
      .set(auth(otro.token))
      .send({})
      .expect(404);
    expect((await stock()).reservedQuantity).toBe(base.reservedQuantity + 3);

    // Cerrar el turno libera el cupo.
    await http()
      .post(`/api/v1/cash/shifts/${cajero.shiftId}/close`)
      .set(auth(cajero.token))
      .send({ countedCash: 19.99, note: 'Arqueo de prueba' })
      .expect(201);
    expect((await stock()).reservedQuantity).toBe(base.reservedQuantity);
    expect(
      await ctx.prisma.offlineQuota.findUniqueOrThrow({ where: { id: segundo.body.data.quota.id } }),
    ).toMatchObject({ status: 'RELEASED' });
  });

  it('requires an open shift and blocks customers', async () => {
    await http()
      .post('/api/v1/sync/quota')
      .set(auth(cajero.token))
      .send({ deviceId: randomUUID() })
      .expect(409);
    await http()
      .post('/api/v1/sync/quota')
      .set(auth(ctx.tokens[0]!))
      .send({ deviceId: randomUUID() })
      .expect(403);
  });
});
