import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Catalog foundation (HTTP + PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const auth = (admin = false) => ({
    Authorization: `Bearer ${ctx.tokens[admin ? 2 : 0]}`,
  });
  const photo = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6XQAAAAASUVORK5CYII=',
    'base64',
  );
  beforeAll(async () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud');
    vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret');
    ctx = await cartTestContext(databaseUrl!);
  }, 60000);
  afterAll(async () => {
    await ctx?.close();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists the warehouse name and ordered photos, protects admin operations and supports legacy photos', async () => {
    const server = ctx.app.getHttpServer();
    await request(server)
      .patch(`/api/v1/branches/${ctx.branch.id}`)
      .set(auth(true))
      .send({ warehouseName: 'Deposito central' })
      .expect(200);
    const branches = await request(server)
      .get(`/api/v1/branches/${ctx.branch.id}`)
      .expect(200);
    expect(branches.body.data.warehouseName).toBe('Deposito central');
    const urls = ['https://example.test/b.png', 'https://example.test/a.png'];
    await request(server)
      .patch(`/api/v1/products/${ctx.product.id}`)
      .set(auth())
      .send({ imageUrls: urls })
      .expect(403);
    const saved = await request(server)
      .patch(`/api/v1/products/${ctx.product.id}`)
      .set(auth(true))
      .send({ imageUrls: urls, wholesalePrice: 15 })
      .expect(200);
    expect(saved.body.data).toMatchObject({
      imageUrls: urls,
      imageUrl: urls[0],
      wholesalePrice: 15,
    });
    expect(
      (
        await ctx.prisma.product.findUniqueOrThrow({
          where: { id: ctx.product.id },
        })
      ).imageUrls,
    ).toEqual(urls);
    await request(server)
      .patch(`/api/v1/products/${ctx.product.id}`)
      .set(auth(true))
      .send({ price: 10 })
      .expect(400);
    const cleared = await request(server)
      .patch(`/api/v1/products/${ctx.product.id}`)
      .set(auth(true))
      .send({ imageUrls: [] })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ imageUrls: [], imageUrl: null });
    const legacy = await request(server)
      .patch(`/api/v1/products/${ctx.product.id}`)
      .set(auth(true))
      .send({ imageUrl: urls[1] })
      .expect(200);
    expect(legacy.body.data.imageUrls).toEqual([urls[1]]);
  });

  it('uses admin-assigned wholesale prices consistently for cart, checkout preview and POS stock movement', async () => {
    const server = ctx.app.getHttpServer();
    await request(server)
      .patch(`/api/v1/users/${ctx.users[0].id}`)
      .set(auth())
      .send({ wholesale: true })
      .expect(403);
    await request(server)
      .patch(`/api/v1/users/${ctx.users[0].id}`)
      .set(auth(true))
      .send({ wholesale: 'false' })
      .expect(400);
    await request(server)
      .patch(`/api/v1/users/${ctx.users[0].id}`)
      .set(auth(true))
      .send({ wholesale: true })
      .expect(200);
    const item = {
      productId: ctx.product.id,
      sizeId: ctx.size.id,
      colorId: ctx.color.id,
      quantity: 2,
    };
    const cart = await request(server)
      .post('/api/v1/cart/items')
      .set(auth())
      .send(item)
      .expect(201);
    expect(cart.body.data.total).toBe(30);
    const preview = await request(server)
      .post('/api/v1/sales/checkout/preview')
      .set(auth())
      .send({ cartId: cart.body.data.id, branchId: ctx.branch.id })
      .expect(201);
    expect(preview.body.data.total).toBe(30);
    await ctx.prisma.role.create({ data: { name: 'CASHIER' } });
    const password = 'FoundationPassword123!';
    await request(server)
      .post('/api/v1/users')
      .set(auth(true))
      .send({
        name: 'Cajero prueba',
        email: 'cashier@foundation.test',
        password,
        roles: ['CASHIER'],
        branchId: ctx.branch.id,
      })
      .expect(201);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'cashier@foundation.test', password })
      .expect(201);
    const cashierAuth = {
      Authorization: `Bearer ${login.body.data.accessToken}`,
    };
    const register = await ctx.prisma.cashRegister.findFirstOrThrow({
      where: { branchId: ctx.branch.id },
    });
    const shift = await request(server)
      .post('/api/v1/cash/shifts')
      .set(cashierAuth)
      .send({
        registerId: register.id,
        openingCash: 0,
        openingKey: randomUUID(),
      })
      .expect(201);
    const sale = await request(server)
      .post('/api/v1/sales/in-store')
      .set(cashierAuth)
      .send({
        branchId: ctx.branch.id,
        shiftId: shift.body.data.id,
        clientId: ctx.users[0].client!.id,
        items: [item],
        paymentMethod: 'CASH',
        expectedTotal: 30,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    expect(sale.body.data).toMatchObject({ total: 30, status: 'COMPLETED' });
    const stock = await ctx.prisma.inventory.findUniqueOrThrow({
      where: {
        branchId_productId_sizeId_colorId: {
          branchId: ctx.branch.id,
          productId: ctx.product.id,
          sizeId: ctx.size.id,
          colorId: ctx.color.id,
        },
      },
    });
    expect(stock.physicalQuantity).toBe(8);
    await request(server)
      .patch(`/api/v1/users/${ctx.users[0].id}`)
      .set(auth(true))
      .send({ wholesale: false })
      .expect(200);
    const retail = await request(server)
      .get('/api/v1/cart')
      .set(auth())
      .expect(200);
    expect(retail.body.data.total).toBe(39.98);
  });

  it('accepts authenticated multipart uploads only for admin and rejects bad or oversized files', async () => {
    const upload = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        secure_url:
          'https://res.cloudinary.com/test-cloud/image/upload/test.png',
        public_id: 'test',
        resource_type: 'image',
      }),
    });
    vi.stubGlobal('fetch', upload);
    const server = ctx.app.getHttpServer();
    await request(server)
      .post('/api/v1/products/images/upload')
      .attach('file', photo, 'test.png')
      .expect(401);
    await request(server)
      .post('/api/v1/products/images/upload')
      .set(auth())
      .attach('file', photo, 'test.png')
      .expect(403);
    await request(server)
      .post('/api/v1/products/images/upload')
      .set(auth(true))
      .attach('file', Buffer.from('<svg/>'), 'test.png')
      .expect(400);
    await request(server)
      .post('/api/v1/products/images/upload')
      .set(auth(true))
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
      .expect(413);
    expect(upload).not.toHaveBeenCalled();
    const result = await request(server)
      .post('/api/v1/products/images/upload')
      .set(auth(true))
      .attach('file', photo, 'test.png')
      .expect(201);
    expect(result.body.data).toEqual({
      url: 'https://res.cloudinary.com/test-cloud/image/upload/test.png',
      publicId: 'test',
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
