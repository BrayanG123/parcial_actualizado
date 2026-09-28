import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('AR resources (HTTP and PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const server = () => ctx.app.getHttpServer();
  const path = () => `/api/v1/products/${ctx.product.id}/ar-resources`;
  const admin = () => ({ Authorization: `Bearer ${ctx.tokens[2]!}` });

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
  }, 30000);
  beforeEach(async () => ctx.prisma.arResource.deleteMany());
  afterAll(async () => ctx?.close());

  it('lets administrators register 3D models that the catalog exposes publicly', async () => {
    const created = (
      await request(server())
        .post(path())
        .set(admin())
        .send({ url: ' https://cdn.example.com/camisa.glb ', format: 'glb' })
        .expect(201)
    ).body.data;
    expect(created).toMatchObject({
      productId: ctx.product.id,
      url: 'https://cdn.example.com/camisa.glb',
      format: 'GLB',
      type: 'MODEL_3D',
      active: true,
    });
    expect(
      (await request(server()).get(path()).expect(200)).body.data,
    ).toHaveLength(1);
    const product = (
      await request(server())
        .get(`/api/v1/products/${ctx.product.id}`)
        .expect(200)
    ).body.data;
    expect(product.arResources.map((r: { id: number }) => r.id)).toEqual([
      created.id,
    ]);

    await request(server())
      .delete(`${path()}/${created.id}`)
      .set(admin())
      .expect(200);
    expect((await request(server()).get(path()).expect(200)).body.data).toEqual(
      [],
    );
    expect(
      (
        await request(server())
          .get(`/api/v1/products/${ctx.product.id}`)
          .expect(200)
      ).body.data.arResources,
    ).toEqual([]);
  });

  it('enforces roles, validation, ownership and the active resource limit', async () => {
    const body = { url: 'https://cdn.example.com/a.glb', format: 'GLB' };
    await request(server()).post(path()).send(body).expect(401);
    await request(server())
      .post(path())
      .set({ Authorization: `Bearer ${ctx.tokens[0]!}` })
      .send(body)
      .expect(403);
    for (const invalid of [
      { url: 'javascript:alert(1)', format: 'GLB' },
      { url: 'https://cdn.example.com/a.obj', format: 'OBJ' },
      { ...body, active: false },
    ])
      await request(server())
        .post(path())
        .set(admin())
        .send(invalid)
        .expect(400);
    await request(server())
      .get('/api/v1/products/2147483647/ar-resources')
      .expect(404);

    for (let i = 0; i < 5; i++)
      await request(server()).post(path()).set(admin()).send(body).expect(201);
    await request(server()).post(path()).set(admin()).send(body).expect(409);
    const other = await ctx.prisma.product.create({
      data: {
        name: 'Otra prenda',
        price: '10',
        categoryId: ctx.product.categoryId,
        seasonId: ctx.product.seasonId,
        collectionId: ctx.product.collectionId,
        supplierId: ctx.product.supplierId,
      },
    });
    const first = await ctx.prisma.arResource.findFirstOrThrow({
      where: { productId: ctx.product.id },
    });
    await request(server())
      .delete(`/api/v1/products/${other.id}/ar-resources/${first.id}`)
      .set(admin())
      .expect(404);
  });
});
