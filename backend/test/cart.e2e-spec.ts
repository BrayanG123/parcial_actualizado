import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Cart (HTTP + PostgreSQL)', () => {
  let context: Awaited<ReturnType<typeof cartTestContext>>;
  const auth = (index = 0) => ({
    Authorization: `Bearer ${context.tokens[index]}`,
  });
  const payload = (quantity = 1) => ({
    productId: context.product.id,
    sizeId: context.size.id,
    colorId: context.color.id,
    quantity,
  });
  const get = (index = 0) =>
    request(context.app.getHttpServer()).get('/api/v1/cart').set(auth(index));
  const add = (body = payload(), index = 0) =>
    request(context.app.getHttpServer())
      .post('/api/v1/cart/items')
      .set(auth(index))
      .send(body);
  const update = (id: number, quantity: number, index = 0) =>
    request(context.app.getHttpServer())
      .patch(`/api/v1/cart/items/${id}`)
      .set(auth(index))
      .send({ quantity });
  const remove = (id: number, index = 0) =>
    request(context.app.getHttpServer())
      .delete(`/api/v1/cart/items/${id}`)
      .set(auth(index));
  const clear = () =>
    request(context.app.getHttpServer())
      .delete('/api/v1/cart/items')
      .set(auth());

  beforeAll(async () => {
    context = await cartTestContext(databaseUrl!);
  }, 60000);
  beforeEach(async () => {
    await context.prisma.cartItem.deleteMany();
    await context.prisma.cart.deleteMany();
    await context.prisma.product.update({
      where: { id: context.product.id },
      data: {
        active: true,
        price: '19.99',
        discountPercent: 0,
        promotionStart: null,
        promotionEnd: null,
      },
    });
    await context.prisma.branch.updateMany({ data: { active: true } });
    await context.prisma.inventory.updateMany({
      data: { physicalQuantity: 10, reservedQuantity: 0 },
    });
  });
  afterAll(async () => {
    await context?.close();
  });

  it('lazily creates and reuses one empty cart, including concurrent first access', async () => {
    const responses = await Promise.all([get(), get(), get()]);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    expect(
      new Set(responses.map((response) => response.body.data.id)).size,
    ).toBe(1);
    expect(responses[0].body.data).toMatchObject({
      items: [],
      total: 0,
      totalQuantity: 0,
      hasAvailability: false,
    });
    expect(await context.prisma.cart.count()).toBe(1);
  });

  it('adds, merges, replaces quantities, removes and clears without changing inventory', async () => {
    let response = await add(payload(2)).expect(201);
    const id = response.body.data.items[0].id;
    expect(response.body.data).toMatchObject({
      total: 39.98,
      totalQuantity: 2,
      itemCount: 1,
      hasAvailability: true,
    });
    response = await add(payload(1)).expect(201);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ id, quantity: 3 });
    response = await update(id, 1).expect(200);
    expect(response.body.data.total).toBe(19.99);
    await add({ ...payload(), sizeId: context.otherSize.id }).expect(201);
    response = await remove(id).expect(200);
    expect(response.body.data.itemCount).toBe(1);
    response = await clear().expect(200);
    expect(response.body.data).toMatchObject({
      items: [],
      total: 0,
      status: 'ACTIVE',
    });
    await clear().expect(200);
    const stock = await context.prisma.inventory.findMany();
    expect(
      stock.every(
        (entry) =>
          entry.physicalQuantity === 10 && entry.reservedQuantity === 0,
      ),
    ).toBe(true);
    expect(await context.prisma.inventoryMovement.count()).toBe(0);
  });

  it('enforces JWT, customer role and ownership of item IDs', async () => {
    await request(context.app.getHttpServer()).get('/api/v1/cart').expect(401);
    await get(2).expect(403);
    const id = (await add().expect(201)).body.data.items[0].id;
    await update(id, 2, 1).expect(404);
    await remove(id, 1).expect(404);
    expect((await get(1).expect(200)).body.data.items).toEqual([]);
    expect((await get().expect(200)).body.data.items[0]).toMatchObject({
      quantity: 1,
    });
  });

  it('rejects invalid quantities, client-controlled prices and cart identity', async () => {
    for (const quantity of [0, -1, 1.5, 101, null]) {
      await add({ ...payload(), quantity } as ReturnType<
        typeof payload
      >).expect(400);
    }
    for (const injected of [
      { unitPrice: 0.01 },
      { cartId: 999 },
      { clientId: 999 },
      { status: 'CONVERTED' },
    ]) {
      await request(context.app.getHttpServer())
        .post('/api/v1/cart/items')
        .set(auth())
        .send({ ...payload(), ...injected })
        .expect(400);
    }
    await add({ ...payload(), productId: 999999 }).expect(404);
    await add({ ...payload(), sizeId: 999999 }).expect(409);
    const id = (await add().expect(201)).body.data.items[0].id;
    await update(id, 0).expect(400);
  });

  it('preserves concurrent additions without duplicate carts, lines or lost increments', async () => {
    const responses = await Promise.all([add(), add()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const result = (await get().expect(200)).body.data;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(2);
    expect(await context.prisma.cart.count()).toBe(1);
  });

  it('checks accumulated quantity and excludes reserved stock and inactive branches', async () => {
    await context.prisma.branch.update({
      where: { id: context.otherBranch.id },
      data: { active: false },
    });
    await context.prisma.inventory.updateMany({
      where: { branchId: context.branch.id },
      data: { physicalQuantity: 3, reservedQuantity: 1 },
    });
    await add(payload(2)).expect(201);
    await add(payload(1)).expect(409);
    expect((await get().expect(200)).body.data.items[0].quantity).toBe(2);
  });

  it('does not sum stock spread between branches to satisfy a variant', async () => {
    await context.prisma.inventory.updateMany({
      data: { physicalQuantity: 1 },
    });
    await add(payload(2)).expect(409);
    expect(await context.prisma.cartItem.count()).toBe(0);
  });

  it('shows when the cart needs a common branch even if every item is available separately', async () => {
    await context.prisma.inventory.updateMany({
      where: { branchId: context.branch.id, sizeId: context.otherSize.id },
      data: { physicalQuantity: 0 },
    });
    await context.prisma.inventory.updateMany({
      where: { branchId: context.otherBranch.id, sizeId: context.size.id },
      data: { physicalQuantity: 0 },
    });
    await add().expect(201);
    const response = await add({
      ...payload(),
      sizeId: context.otherSize.id,
    }).expect(201);
    expect(
      response.body.data.items.every(
        (item: { available: boolean }) => item.available,
      ),
    ).toBe(true);
    expect(response.body.data).toMatchObject({
      availableBranches: [],
      hasAvailability: false,
    });
  });

  it('recalculates promotions and prices with decimal totals while keeping the stored snapshot', async () => {
    await context.prisma.product.update({
      where: { id: context.product.id },
      data: {
        discountPercent: 15,
        promotionStart: new Date('2020-01-01'),
        promotionEnd: new Date('2099-01-01'),
      },
    });
    let response = await add(payload(3)).expect(201);
    expect(response.body.data.items[0]).toMatchObject({
      unitPrice: 16.99,
      subtotal: 50.97,
    });
    const catalog = await request(context.app.getHttpServer())
      .get(`/api/v1/products/${context.product.id}`)
      .expect(200);
    expect(catalog.body.data.currentPrice).toBe(16.99);
    await context.prisma.product.update({
      where: { id: context.product.id },
      data: { price: '0.10', promotionEnd: new Date('2021-01-01') },
    });
    response = await get().expect(200);
    expect(response.body.data).toMatchObject({ total: 0.3 });
    expect(response.body.data.items[0]).toMatchObject({
      unitPrice: 0.1,
      storedUnitPrice: 16.99,
      priceChanged: true,
      promotionActive: false,
    });
  });

  it('reports stock loss and deactivated products without losing the users selection', async () => {
    const id = (await add(payload(2)).expect(201)).body.data.items[0].id;
    await context.prisma.inventory.updateMany({
      data: { reservedQuantity: 9 },
    });
    let response = await get().expect(200);
    expect(response.body.data.items[0]).toMatchObject({
      quantity: 2,
      available: false,
      issue: 'INSUFFICIENT_STOCK',
    });
    await context.prisma.product.update({
      where: { id: context.product.id },
      data: { active: false },
    });
    response = await get().expect(200);
    expect(response.body.data.items[0]).toMatchObject({
      issue: 'PRODUCT_INACTIVE',
    });
    await remove(id).expect(200);
    expect(
      (await context.prisma.inventory.findMany()).every(
        (entry) => entry.reservedQuantity === 9,
      ),
    ).toBe(true);
  });

  it('enforces active-cart uniqueness at database level while retaining historical carts', async () => {
    const clientId = context.users[0].client!.id;
    const response = await add().expect(201);
    const oldCart = response.body.data;
    await expect(
      context.prisma.cart.create({ data: { clientId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await context.prisma.cart.update({
      where: { id: oldCart.id },
      data: { status: 'CONVERTED' },
    });
    await context.prisma.cart.create({
      data: { clientId, status: 'ABANDONED' },
    });
    const current = (await get().expect(200)).body.data;
    expect(current.id).not.toBe(oldCart.id);
    expect(current.items).toEqual([]);
    await update(oldCart.items[0].id, 2).expect(404);
    expect(
      await context.prisma.cartItem.count({ where: { cartId: oldCart.id } }),
    ).toBe(1);
  });
});
