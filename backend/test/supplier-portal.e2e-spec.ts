import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Supplier portal ownership (HTTP + PostgreSQL)',
  () => {
    let ctx: Awaited<ReturnType<typeof cartTestContext>>;
    let supplierToken: string;
    let supplierUserId: number;
    let otherSupplierId: number;
    let otherProductId: number;
    let movementId: number;
    const auth = (token = supplierToken) => ({
      Authorization: `Bearer ${token}`,
    });
    const form = () => ({
      name: 'Camisa proveedor',
      description: 'Algodon, lavar en frio.',
      supplierAvailability: '20 unidades talla M para el viernes',
    });
    const update = (
      id = ctx.product.id,
      body: object = form(),
      token = supplierToken,
    ) =>
      request(ctx.app.getHttpServer())
        .patch(`/api/v1/supplier/products/${id}`)
        .set(auth(token))
        .send(body);
    const list = (path = 'products', token = supplierToken) =>
      request(ctx.app.getHttpServer())
        .get(`/api/v1/supplier/${path}`)
        .set(auth(token));
    const admin = () => ctx.tokens[2];
    const bind = (supplierId: number | null) =>
      request(ctx.app.getHttpServer())
        .patch(`/api/v1/users/${supplierUserId}`)
        .set(auth(admin()))
        .send({ supplierId });
    beforeAll(async () => {
      ctx = await cartTestContext(databaseUrl!);
      await ctx.prisma.role.upsert({
        where: { name: 'SUPPLIER' },
        create: { name: 'SUPPLIER' },
        update: {},
      });
      const created = await request(ctx.app.getHttpServer())
        .post('/api/v1/users')
        .set(auth(admin()))
        .send({
          name: 'Proveedor test',
          email: 'proveedor@portal.test',
          password: 'PortalPassword123!',
          roles: ['SUPPLIER'],
          supplierId: ctx.product.supplierId,
        })
        .expect(201);
      supplierUserId = created.body.data.id;
      expect(created.body.data.supplier).toMatchObject({
        id: ctx.product.supplierId,
        active: true,
      });
      const session = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'proveedor@portal.test',
          password: 'PortalPassword123!',
        })
        .expect(201);
      supplierToken = session.body.data.accessToken;
      expect(session.body.data.user.supplier.id).toBe(ctx.product.supplierId);
      otherSupplierId = (
        await ctx.prisma.supplier.create({ data: { name: 'Otro proveedor' } })
      ).id;
      const product = await ctx.prisma.product.create({
        data: {
          name: 'Prenda ajena',
          price: 50,
          supplierId: otherSupplierId,
          categoryId: ctx.product.categoryId,
          seasonId: ctx.product.seasonId,
          collectionId: ctx.product.collectionId,
        },
      });
      otherProductId = product.id;
      const inventory = await ctx.prisma.inventory.findFirstOrThrow({
        where: { productId: ctx.product.id },
      });
      movementId = (
        await ctx.prisma.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: 'PENDING_ENTRY',
            status: 'PENDING',
            quantity: 5,
            reference: 'OC-PROPIA',
            observation: 'Nota interna',
            scheduledAt: new Date('2100-01-01'),
          },
        })
      ).id;
      const otherStock = await ctx.prisma.inventory.create({
        data: {
          branchId: ctx.branch.id,
          productId: otherProductId,
          sizeId: ctx.size.id,
          colorId: ctx.color.id,
        },
      });
      await ctx.prisma.inventoryMovement.create({
        data: {
          inventoryId: otherStock.id,
          type: 'PENDING_ENTRY',
          status: 'PENDING',
          quantity: 100,
          reference: 'OC-AJENA',
        },
      });
    }, 60000);
    beforeEach(async () => {
      await ctx.prisma.supplier.update({
        where: { id: ctx.product.supplierId },
        data: { active: true },
      });
      await ctx.prisma.user.update({
        where: { id: supplierUserId },
        data: { supplierId: ctx.product.supplierId, active: true },
      });
      await ctx.prisma.product.update({
        where: { id: ctx.product.id },
        data: {
          supplierId: ctx.product.supplierId,
          name: 'Camisa',
          active: true,
          supplierAvailability: null,
        },
      });
    });
    afterAll(async () => {
      await ctx?.close();
    });

    it('lists only owned products, including inactive ones, without accepting a supplier id from the caller', async () => {
      await ctx.prisma.product.update({
        where: { id: ctx.product.id },
        data: { active: false },
      });
      const result = (await list().expect(200)).body.data;
      expect(result.data.map((p: { id: number }) => p.id)).toEqual([
        ctx.product.id,
      ]);
      expect(result.data[0]).toMatchObject({ active: false });
      expect(result.data[0].price).toBeUndefined();
      await list(`products?supplierId=${otherSupplierId}`).expect(400);
      await list('products?limit=0').expect(400);
      await list('products', ctx.tokens[0]).expect(403);
      await request(ctx.app.getHttpServer())
        .get('/api/v1/supplier/products')
        .expect(401);
    });
    it('edits the owned commercial data without changing publication, price or stock', async () => {
      const before = await ctx.prisma.inventory.findMany({
        where: { productId: ctx.product.id },
      });
      await update().expect(200);
      expect(
        await ctx.prisma.product.findUniqueOrThrow({
          where: { id: ctx.product.id },
        }),
      ).toMatchObject({
        name: form().name,
        supplierAvailability: form().supplierAvailability,
        active: true,
      });
      expect(
        await ctx.prisma.inventory.findMany({
          where: { productId: ctx.product.id },
        }),
      ).toEqual(before);
      await update(otherProductId).expect(404);
      for (const extra of [
        { price: 1 },
        { active: false },
        { supplierId: otherSupplierId },
        { wholesalePrice: 1 },
        { sizeIds: [] },
        { imageUrls: [] },
      ]) {
        await update(ctx.product.id, { ...form(), ...extra }).expect(400);
      }
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/products/${ctx.product.id}`)
        .set(auth())
        .send({ price: 1 })
        .expect(403);
      await request(ctx.app.getHttpServer())
        .post('/api/v1/products')
        .set(auth())
        .send({})
        .expect(403);
      expect(
        (
          await request(ctx.app.getHttpServer())
            .get(`/api/v1/products/${ctx.product.id}`)
            .expect(200)
        ).body.data.supplierAvailability,
      ).toBeUndefined();
      await list(`products/${ctx.product.id}/supply`).expect(403);
      expect(
        (await list(`products/${ctx.product.id}/supply`, admin()).expect(200))
          .body.data.supplierAvailability,
      ).toBe(form().supplierAvailability);
    });
    it('validates the season/collection pair and preserves archived assignments when editing descriptions', async () => {
      await update(ctx.product.id, {
        ...form(),
        seasonId: ctx.product.seasonId,
      }).expect(400);
      await update(ctx.product.id, {
        ...form(),
        seasonId: null,
        collectionId: null,
      }).expect(400);
      await update(ctx.product.id, {
        ...form(),
        seasonId: ctx.product.seasonId,
        collectionId: 2147483647,
      }).expect(400);
      const otherSeason = await ctx.prisma.season.create({
        data: {
          name: 'Temporada distinta',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });
      await update(ctx.product.id, {
        ...form(),
        seasonId: otherSeason.id,
        collectionId: ctx.product.collectionId,
      }).expect(400);
      await update(ctx.product.id, {
        ...form(),
        seasonId: ctx.product.seasonId,
        collectionId: ctx.product.collectionId,
      }).expect(200);
      await ctx.prisma.season.update({
        where: { id: ctx.product.seasonId },
        data: { active: false },
      });
      try {
        await update().expect(200);
        await update(ctx.product.id, {
          ...form(),
          seasonId: ctx.product.seasonId,
          collectionId: ctx.product.collectionId,
        }).expect(400);
      } finally {
        await ctx.prisma.season.update({
          where: { id: ctx.product.seasonId },
          data: { active: true },
        });
      }
    });
    it('blocks disabled/unlinked accounts and follows reassignment with the existing JWT', async () => {
      await bind(null).expect(200);
      await list().expect(403);
      await update().expect(403);
      await bind(otherSupplierId).expect(200);
      expect(
        (await list().expect(200)).body.data.data.map(
          (p: { id: number }) => p.id,
        ),
      ).toEqual([otherProductId]);
      await update().expect(404);
      await bind(ctx.product.supplierId).expect(200);
      await ctx.prisma.supplier.update({
        where: { id: ctx.product.supplierId },
        data: { active: false },
      });
      await list().expect(403);
      await update().expect(403);
      await list('deliveries').expect(403);
      await ctx.prisma.supplier.update({
        where: { id: ctx.product.supplierId },
        data: { active: true },
      });
      await ctx.prisma.user.update({
        where: { id: supplierUserId },
        data: { active: false },
      });
      await list().expect(401);
    });
    it('rejects association changes without administration or a supplier role', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/users/${supplierUserId}`)
        .set(auth())
        .send({ supplierId: otherSupplierId })
        .expect(403);
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/users/${ctx.users[0].id}`)
        .set(auth(admin()))
        .send({ supplierId: otherSupplierId })
        .expect(400);
      await bind(2147483647).expect(400);
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Atacante',
          email: 'attacker@portal.test',
          password: 'PortalPassword123!',
          supplierId: otherSupplierId,
        })
        .expect(400);
    });
    it('shows only deliveries of owned products and lets the store alone confirm reception', async () => {
      const result = (await list('deliveries').expect(200)).body.data;
      expect(result.data.map((e: { id: number }) => e.id)).toEqual([
        movementId,
      ]);
      expect(result.data[0].observation).toBeUndefined();
      expect(result.data[0].inventory.physicalQuantity).toBeUndefined();
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/inventory/movements/${movementId}/complete`)
        .set(auth())
        .expect(403);
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/inventory/movements/${movementId}/complete`)
        .set(auth(admin()))
        .expect(201);
      expect(
        (await list('deliveries').expect(200)).body.data.data[0].status,
      ).toBe('COMPLETED');
    });
    it('clears the old supplier supply note on product reassignment and removes access immediately', async () => {
      await update().expect(200);
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/products/${ctx.product.id}`)
        .set(auth(admin()))
        .send({ supplierId: otherSupplierId })
        .expect(200);
      await update().expect(404);
      expect((await list().expect(200)).body.data.data).toHaveLength(0);
      expect(
        (
          await ctx.prisma.product.findUniqueOrThrow({
            where: { id: ctx.product.id },
          })
        ).supplierAvailability,
      ).toBeNull();
    });
    it('revoking the supplier role invalidates access with the old JWT', async () => {
      const customerRole = await ctx.prisma.role.findUniqueOrThrow({
        where: { name: 'CUSTOMER' },
      });
      await ctx.prisma.userRole.create({
        data: { userId: supplierUserId, roleId: customerRole.id },
      });
      await request(ctx.app.getHttpServer())
        .delete(`/api/v1/roles/users/${supplierUserId}/SUPPLIER`)
        .set(auth(admin()))
        .expect(200);
      await list().expect(403);
      await update().expect(403);
    });
  },
);
