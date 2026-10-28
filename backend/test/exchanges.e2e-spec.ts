import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Exchanges and inventory consistency (HTTP + PostgreSQL)',
  () => {
    let ctx: Awaited<ReturnType<typeof cartTestContext>>;
    let cashier: string;
    let shiftId: number;
    let cheap: number;
    let pricey: number;
    const deviceId = randomUUID();
    const http = () => request(ctx.app.getHttpServer());
    const auth = (token = cashier) => ({ Authorization: `Bearer ${token}` });
    const M = () => ({
      productId: ctx.product.id,
      sizeId: ctx.size.id,
      colorId: ctx.color.id,
    });
    const L = () => ({
      productId: ctx.product.id,
      sizeId: ctx.otherSize.id,
      colorId: ctx.color.id,
    });
    const stock = (v: { productId: number; sizeId: number; colorId: number }) =>
      ctx.prisma.inventory.findFirstOrThrow({
        where: { branchId: ctx.branch.id, ...v },
      });
    const sync = (operations: object[]) =>
      http()
        .post('/api/v1/sync/operations')
        .set(auth())
        .send({ deviceId, operations })
        .expect(200)
        .then((r) => r.body.data.results);
    /** Venta completada de `quantity` camisas M (19.99) en la sucursal del cajero. */
    const sell = async (quantity = 2) => {
      const sale = (
        await http()
          .post('/api/v1/sales/in-store')
          .set(auth())
          .send({
            shiftId,
            idempotencyKey: randomUUID(),
            branchId: ctx.branch.id,
            items: [{ ...M(), quantity }],
            expectedTotal: Number((quantity * 19.99).toFixed(2)),
            paymentMethod: 'CASH',
          })
          .expect(201)
      ).body.data;
      const item = await ctx.prisma.saleItem.findFirstOrThrow({
        where: { saleId: sale.id_venta ?? sale.id },
      });
      return { saleId: item.saleId, itemId: item.id };
    };
    const exchange = (body: object) =>
      http().post('/api/v1/exchanges').set(auth()).send(body);

    beforeAll(async () => {
      ctx = await cartTestContext(databaseUrl!);
      const role = await ctx.prisma.role.create({ data: { name: 'CASHIER' } });
      await ctx.prisma.user.create({
        data: {
          name: 'Cajero',
          email: 'cashier@exchange.test',
          passwordHash: await hash('ExchangePassword123!', 10),
          employee: { create: { branchId: ctx.branch.id, jobTitle: 'Cajero' } },
          roles: { create: { roleId: role.id } },
        },
      });
      cashier = (
        await http()
          .post('/api/v1/auth/login')
          .send({
            email: 'cashier@exchange.test',
            password: 'ExchangePassword123!',
          })
          .expect(201)
      ).body.data.accessToken;
      const register = await ctx.prisma.cashRegister.findFirstOrThrow({
        where: { branchId: ctx.branch.id },
      });
      shiftId = (
        await http()
          .post('/api/v1/cash/shifts')
          .set(auth())
          .send({
            registerId: register.id,
            openingCash: 100,
            openingKey: randomUUID(),
          })
          .expect(201)
      ).body.data.id;
      const base = await ctx.prisma.product.findUniqueOrThrow({
        where: { id: ctx.product.id },
      });
      const create = async (name: string, price: string) => {
        const p = await ctx.prisma.product.create({
          data: {
            name,
            price,
            categoryId: base.categoryId,
            seasonId: base.seasonId,
            collectionId: base.collectionId,
            supplierId: base.supplierId,
            sizes: { create: { sizeId: ctx.size.id } },
            colors: { create: { colorId: ctx.color.id } },
          },
        });
        await ctx.prisma.inventory.create({
          data: {
            branchId: ctx.branch.id,
            productId: p.id,
            sizeId: ctx.size.id,
            colorId: ctx.color.id,
            physicalQuantity: 5,
          },
        });
        return p.id;
      };
      cheap = await create('Polera', '9.99');
      pricey = await create('Chaqueta', '49.99');
    }, 60_000);
    afterAll(async () => ctx?.close());

    it('exchanges a size of the same garment: stock back and out, kardex and remaining units', async () => {
      const { saleId, itemId } = await sell(2);
      const options = (
        await http()
          .get(`/api/v1/exchanges/sales/${saleId}`)
          .set(auth())
          .expect(200)
      ).body.data;
      expect(options).toMatchObject({
        windowDays: 7,
        withinWindow: true,
        items: [{ id: itemId, exchangeable: 2 }],
      });
      expect(options.candidates.length).toBeGreaterThan(1);
      const [m0, l0] = [await stock(M()), await stock(L())];
      const res = await exchange({
        saleId,
        saleItemId: itemId,
        quantity: 1,
        newProductId: L().productId,
        newSizeId: L().sizeId,
        newColorId: L().colorId,
        reason: 'Talla chica',
      }).expect(201);
      expect(res.body.data).toMatchObject({
        settlement: 'EVEN',
        difference: '0',
        quantity: 1,
      });
      expect((await stock(M())).physicalQuantity).toBe(m0.physicalQuantity + 1);
      expect((await stock(L())).physicalQuantity).toBe(l0.physicalQuantity - 1);
      const movements = await ctx.prisma.inventoryMovement.findMany({
        where: { reference: `EXCHANGE:${res.body.data.id}` },
      });
      expect(movements.map((m) => m.type).sort()).toEqual(['RETURN', 'SALE']);
      expect(
        (await ctx.prisma.saleItem.findUniqueOrThrow({ where: { id: itemId } }))
          .exchangedQuantity,
      ).toBe(1);
      const again = await exchange({
        saleId,
        saleItemId: itemId,
        quantity: 2,
        ...{
          newProductId: L().productId,
          newSizeId: L().sizeId,
          newColorId: L().colorId,
        },
      }).expect(409);
      expect(again.body).toMatchObject({ code: 'ALREADY_EXCHANGED' });
    });

    it('issues a credit note for a cheaper garment and charges the shift for a pricier one', async () => {
      const { saleId, itemId } = await sell(2);
      const credit = await exchange({
        saleId,
        saleItemId: itemId,
        quantity: 1,
        newProductId: cheap,
        newSizeId: ctx.size.id,
        newColorId: ctx.color.id,
      }).expect(201);
      expect(credit.body.data).toMatchObject({
        settlement: 'CREDIT_NOTE',
        difference: '-10',
        creditNote: { amount: '10', status: 'ACTIVE' },
      });
      const code = credit.body.data.creditNote.code as string;
      expect(
        (
          await http()
            .get(`/api/v1/credit-notes/${code}`)
            .set(auth())
            .expect(200)
        ).body.data.balance,
      ).toBe('10');
      expect(
        (
          await http()
            .post(`/api/v1/credit-notes/${code}/redeem`)
            .set(auth())
            .send({ amount: 4 })
            .expect(201)
        ).body.data,
      ).toMatchObject({ balance: '6', status: 'ACTIVE' });
      expect(
        (
          await http()
            .post(`/api/v1/credit-notes/${code}/redeem`)
            .set(auth())
            .send({ amount: 7 })
            .expect(409)
        ).body.code,
      ).toBe('CREDIT_NOTE_INSUFFICIENT');

      const body = {
        saleId,
        saleItemId: itemId,
        quantity: 1,
        newProductId: pricey,
        newSizeId: ctx.size.id,
        newColorId: ctx.color.id,
      };
      expect((await exchange(body).expect(400)).body.code).toBe(
        'SHIFT_REQUIRED',
      );
      const cashBefore = (
        await ctx.prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId } })
      ).cashTotal;
      const charged = await exchange({
        ...body,
        shiftId,
        expectedDifference: 30,
      }).expect(201);
      expect(charged.body.data).toMatchObject({
        settlement: 'CHARGED',
        difference: '30',
      });
      const cashAfter = (
        await ctx.prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId } })
      ).cashTotal;
      expect(cashAfter.minus(cashBefore).toNumber()).toBe(30);
    });

    it('syncs an offline EXCHANGE once and reports window and price conflicts', async () => {
      const { saleId, itemId } = await sell(1);
      const operation = {
        operationId: randomUUID(),
        type: 'EXCHANGE',
        branchId: ctx.branch.id,
        createdAtLocal: new Date().toISOString(),
        payload: {
          saleId,
          saleItemId: itemId,
          quantity: 1,
          newProductId: L().productId,
          newSizeId: L().sizeId,
          newColorId: L().colorId,
        },
      };
      // Offline el cajero no conoce el id de la linea: la identifica por la variante devuelta.
      const { saleItemId: _linea, ...sinLinea } = operation.payload;
      operation.payload = {
        ...sinLinea,
        returnedProductId: M().productId,
        returnedSizeId: M().sizeId,
        returnedColorId: M().colorId,
      } as typeof operation.payload;
      const l0 = (await stock(L())).physicalQuantity;
      const [first] = await sync([operation]);
      expect(first).toMatchObject({
        status: 'CONFIRMED',
        resourceType: 'EXCHANGE',
      });
      const [second] = await sync([operation]);
      expect(second.resourceId).toBe(first.resourceId);
      expect((await stock(L())).physicalQuantity).toBe(l0 - 1);

      const other = await sell(1);
      const priced = {
        ...operation,
        operationId: randomUUID(),
        payload: {
          ...operation.payload,
          saleId: other.saleId,
          saleItemId: other.itemId,
          expectedDifference: 5,
        },
      };
      const [price] = await sync([priced]);
      expect(price).toMatchObject({
        status: 'CONFLICT',
        code: 'PRICE_CHANGED',
        detail: { currentDifference: 0 },
      });

      await ctx.prisma.sale.update({
        where: { id: other.saleId },
        data: {
          soldAt: new Date(Date.now() - 10 * 86_400_000),
          confirmedAt: new Date(Date.now() - 10 * 86_400_000),
        },
      });
      const late = {
        ...priced,
        operationId: randomUUID(),
        payload: {
          ...operation.payload,
          saleId: other.saleId,
          saleItemId: other.itemId,
        },
      };
      const [window] = await sync([late]);
      expect(window).toMatchObject({
        status: 'CONFLICT',
        code: 'EXCHANGE_WINDOW_EXPIRED',
      });
      expect(window.detail.windowDays).toBe(7);
      // La empresa amplia su plazo y el mismo cambio se confirma al reintentar.
      await http()
        .patch('/api/v1/tenant/settings')
        .set(auth(ctx.tokens[2]!))
        .send({ exchangeWindowDays: 30 })
        .expect(200);
      const [retry] = await sync([late]);
      expect(retry).toMatchObject({ status: 'CONFIRMED', attempts: 2 });
      await http()
        .patch('/api/v1/tenant/settings')
        .set(auth(ctx.tokens[2]!))
        .send({ exchangeWindowDays: 7 })
        .expect(200);
      await http()
        .patch('/api/v1/tenant/settings')
        .set(auth())
        .send({ exchangeWindowDays: 1 })
        .expect(403);
    });

    it('keeps inventory consistent when an offline sale and an online sale compete for the last unit', async () => {
      const current = await stock(M());
      await ctx.prisma.inventory.update({
        where: { id: current.id },
        data: { physicalQuantity: current.reservedQuantity + 1 },
      });
      const movementsBefore = await ctx.prisma.inventoryMovement.count({
        where: { inventoryId: current.id, type: 'SALE' },
      });
      const offline = {
        operationId: randomUUID(),
        type: 'SALE_CASH',
        branchId: ctx.branch.id,
        createdAtLocal: new Date().toISOString(),
        payload: {
          shiftId,
          items: [{ ...M(), quantity: 1, unitPrice: 19.99 }],
          total: 19.99,
          paymentMethod: 'CASH',
        },
      };
      const [online, [offlineResult]] = await Promise.all([
        http()
          .post('/api/v1/sales/in-store')
          .set(auth())
          .send({
            shiftId,
            idempotencyKey: randomUUID(),
            branchId: ctx.branch.id,
            items: [{ ...M(), quantity: 1 }],
            expectedTotal: 19.99,
            paymentMethod: 'CASH',
          }),
        sync([offline]),
      ]);
      const won = [
        online.status === 201,
        offlineResult.status === 'CONFIRMED',
      ].filter(Boolean).length;
      expect(won).toBe(1);
      if (offlineResult.status !== 'CONFIRMED')
        expect(offlineResult.code).toMatch(
          /STOCK_INSUFFICIENT|CONCURRENT_UPDATE|CONFLICT/,
        );
      const after = await stock(M());
      expect(after.physicalQuantity).toBe(after.reservedQuantity);
      expect(after.physicalQuantity).toBeGreaterThanOrEqual(0);
      expect(
        await ctx.prisma.inventoryMovement.count({
          where: { inventoryId: current.id, type: 'SALE' },
        }),
      ).toBe(movementsBefore + 1);
    });

    it('never exchanges more units than sold when two exchanges race for the same line', async () => {
      for (const v of [M(), L()]) {
        const row = await stock(v);
        await ctx.prisma.inventory.update({
          where: { id: row.id },
          data: { physicalQuantity: row.reservedQuantity + 10 },
        });
      }
      const { saleId, itemId } = await sell(1);
      const body = {
        saleId,
        saleItemId: itemId,
        quantity: 1,
        newProductId: L().productId,
        newSizeId: L().sizeId,
        newColorId: L().colorId,
      };
      const results = await Promise.all([exchange(body), exchange(body)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        (await ctx.prisma.saleItem.findUniqueOrThrow({ where: { id: itemId } }))
          .exchangedQuantity,
      ).toBe(1);
      expect(
        await ctx.prisma.exchange.count({ where: { saleItemId: itemId } }),
      ).toBe(1);
    });
  },
);
