import 'reflect-metadata';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client as PgClient } from 'pg';
import { hash } from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { PrismaClient, RoleName } from '../src/generated/prisma/client.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { ReservationExpirationService } from '../src/modules/reservations/reservation-expiration.service.js';
import { ReservationsService } from '../src/modules/reservations/reservations.service.js';

// Explicit test URL only. All objects live in a randomly named, disposable schema.
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Reservations (HTTP + PostgreSQL)', () => {
  const schema = `reservations_test_${randomUUID().replaceAll('-', '')}`;
  const password = 'ReservationTest123!';
  let sql: PgClient;
  let prisma: PrismaClient;
  let app: INestApplication;
  let branchId: number;
  let otherBranchId: number;
  let productId: number;
  let sizeId: number;
  let otherSizeId: number;
  let colorId: number;
  let token: string;
  let otherToken: string;
  let managerToken: string;
  let otherManagerToken: string;
  let service: ReservationsService;

  const auth = (accessToken = token) => ({
    Authorization: `Bearer ${accessToken}`,
  });
  const payload = (quantity = 2) => ({
    branchId,
    approximateTime: '2035-09-11T15:00:00-04:00',
    items: [{ productId, sizeId, colorId, quantity }],
  });
  const create = (body = payload(), accessToken = token) =>
    request(app.getHttpServer())
      .post('/api/v1/reservations')
      .set(auth(accessToken))
      .send(body);
  const stock = () =>
    prisma.inventory.findUniqueOrThrow({
      where: {
        branchId_productId_sizeId_colorId: {
          branchId,
          productId,
          sizeId,
          colorId,
        },
      },
    });
  const status = (id: number, value: string, accessToken = managerToken) =>
    request(app.getHttpServer())
      .patch(`/api/v1/reservations/${id}/status`)
      .set(auth(accessToken))
      .send({ status: value });

  beforeAll(async () => {
    sql = new PgClient({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const migrations = new URL('../prisma/migrations/', import.meta.url);
    for (const directory of (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const migration = await readFile(
        new URL(`${directory.name}/migration.sql`, migrations),
        'utf8',
      );
      await sql.query(
        migration.replace('CREATE SCHEMA IF NOT EXISTS "public";', ''),
      );
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: databaseUrl, options: '-c timezone=UTC' },
        { schema },
      ),
    });
    const branch = await prisma.branch.create({
      data: { name: 'Test Central', city: 'La Paz', address: 'Test' },
    });
    branchId = branch.id;
    otherBranchId = (
      await prisma.branch.create({
        data: { name: 'Test Norte', city: 'La Paz', address: 'Test' },
      })
    ).id;
    const category = await prisma.category.create({
      data: { name: 'Camisas' },
    });
    const season = await prisma.season.create({
      data: {
        name: 'Test',
        startDate: new Date('2035-01-01'),
        endDate: new Date('2035-12-31'),
      },
    });
    const collection = await prisma.collection.create({
      data: { name: 'Test', seasonId: season.id },
    });
    const supplier = await prisma.supplier.create({
      data: { name: 'Test Supplier' },
    });
    sizeId = (await prisma.size.create({ data: { name: 'M' } })).id;
    otherSizeId = (await prisma.size.create({ data: { name: 'L' } })).id;
    colorId = (
      await prisma.color.create({ data: { name: 'Azul', hexCode: '#0000FF' } })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: 'Camisa',
          price: 100,
          categoryId: category.id,
          seasonId: season.id,
          collectionId: collection.id,
          supplierId: supplier.id,
          sizes: { create: [{ sizeId }, { sizeId: otherSizeId }] },
          colors: { create: { colorId } },
        },
      })
    ).id;
    await prisma.inventory.createMany({
      data: [sizeId, otherSizeId].map((id) => ({
        branchId,
        productId,
        sizeId: id,
        colorId,
        physicalQuantity: 5,
      })),
    });
    const passwordHash = await hash(password, 10);
    for (const name of ['CUSTOMER', 'BRANCH_MANAGER'] as RoleName[]) {
      await prisma.role.create({ data: { name } });
    }
    for (const [email, role, assignedBranch] of [
      ['customer@test.local', 'CUSTOMER', null],
      ['other@test.local', 'CUSTOMER', null],
      ['manager@test.local', 'BRANCH_MANAGER', branchId],
      ['other-manager@test.local', 'BRANCH_MANAGER', otherBranchId],
    ] as const) {
      const roleRecord = await prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await prisma.user.create({
        data: {
          name: email,
          email,
          passwordHash,
          roles: { create: { roleId: roleRecord.id } },
          client: assignedBranch ? undefined : { create: {} },
          employee: assignedBranch
            ? { create: { branchId: assignedBranch, jobTitle: 'Encargado' } }
            : undefined,
        },
      });
    }
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ReservationExpirationService)
      .useValue({})
      .compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    service = app.get(ReservationsService);
    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(201);
      return response.body.data.accessToken as string;
    };
    token = await login('customer@test.local');
    otherToken = await login('other@test.local');
    managerToken = await login('manager@test.local');
    otherManagerToken = await login('other-manager@test.local');
  }, 60000);

  beforeEach(async () => {
    await prisma.inventoryMovement.deleteMany();
    await prisma.reservationItem.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.inventory.updateMany({
      data: { physicalQuantity: 5, reservedQuantity: 0 },
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (sql) {
      // Never accept a schema name from user input or DATABASE_URL.
      if (!/^reservations_test_[a-f0-9]{32}$/.test(schema))
        throw new Error('Invalid test schema');
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it('runs creation, preparation, arrival and completion with two variants', async () => {
    const body = payload();
    body.items.push({ productId, sizeId: otherSizeId, colorId, quantity: 1 });
    const response = await create(body).expect(201);
    const reservation = response.body.data;
    expect(reservation.expiresAt).toBe('2035-09-12T04:00:00.000Z');
    expect(reservation.items).toHaveLength(2);
    expect(JSON.stringify(reservation)).not.toContain('passwordHash');
    expect(await stock()).toMatchObject({
      physicalQuantity: 5,
      reservedQuantity: 2,
    });
    await status(reservation.id, 'PREPARING').expect(200);
    const ready = await status(reservation.id, 'READY').expect(200);
    expect(
      ready.body.data.items.every(
        (item: { status: string }) => item.status === 'PREPARED',
      ),
    ).toBe(true);
    await status(reservation.id, 'CUSTOMER_PRESENT').expect(200);
    await status(reservation.id, 'COMPLETED').expect(200);
    await status(reservation.id, 'COMPLETED').expect(200);
    expect(await stock()).toMatchObject({
      physicalQuantity: 5,
      reservedQuantity: 0,
    });
    expect(
      await prisma.inventoryMovement.count({
        where: { type: 'RESERVATION_RELEASE' },
      }),
    ).toBe(2);
  });

  it('enforces authentication, ownership, roles and assigned branches', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reservations')
      .send(payload())
      .expect(401);
    await create(payload(), managerToken).expect(403);
    const reservation = (await create().expect(201)).body.data;
    await request(app.getHttpServer())
      .get(`/api/v1/reservations/${reservation.id}`)
      .set(auth(otherToken))
      .expect(403);
    await status(reservation.id, 'PREPARING', otherManagerToken).expect(403);
    await status(reservation.id, 'PREPARING', token).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/reservations?branchId=${branchId}`)
      .set(auth(otherManagerToken))
      .expect(403);
    const own = await request(app.getHttpServer())
      .get('/api/v1/reservations/mine')
      .set(auth())
      .expect(200);
    expect(own.body.data.meta.total).toBe(1);
    const other = await request(app.getHttpServer())
      .get('/api/v1/reservations/mine')
      .set(auth(otherToken))
      .expect(200);
    expect(other.body.data.meta.total).toBe(0);
  });

  it('validates nested items, dates and rejects injected client identity', async () => {
    await create({ ...payload(), items: [] }).expect(400);
    await create({
      ...payload(),
      items: [{ ...payload().items[0], quantity: 0 }],
    }).expect(400);
    await create({
      ...payload(),
      items: [...payload().items, ...payload().items],
    }).expect(400);
    await create({
      ...payload(),
      approximateTime: '2035-09-11T15:00:00',
    }).expect(400);
    await create({
      ...payload(),
      approximateTime: '2000-01-01T10:00:00Z',
    }).expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/reservations')
      .set(auth())
      .send({ ...payload(), clientId: 999 })
      .expect(400);
    await create({
      ...payload(),
      items: [{ ...payload().items[0], productId: 999999 }],
    }).expect(409);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('rejects a whole reservation when one of its variants lacks stock', async () => {
    const body = payload();
    body.items.push({ productId, sizeId: otherSizeId, colorId, quantity: 6 });
    await create(body).expect(409);
    expect(await stock()).toMatchObject({
      physicalQuantity: 5,
      reservedQuantity: 0,
    });
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it('prevents overselling the last unit under simultaneous requests', async () => {
    await prisma.inventory.updateMany({ data: { physicalQuantity: 1 } });
    const results = await Promise.all([
      create(payload(1)),
      create(payload(1), otherToken),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await stock()).toMatchObject({
      physicalQuantity: 1,
      reservedQuantity: 1,
    });
    expect(await prisma.reservation.count()).toBe(1);
    expect(
      await prisma.inventoryMovement.count({ where: { type: 'RESERVATION' } }),
    ).toBe(1);
  });

  it('cancels concurrently without releasing stock twice', async () => {
    const id = (await create().expect(201)).body.data.id;
    const cancel = () =>
      request(app.getHttpServer())
        .patch(`/api/v1/reservations/${id}/cancel`)
        .set(auth());
    const responses = await Promise.all([cancel(), cancel()]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await stock()).toMatchObject({
      physicalQuantity: 5,
      reservedQuantity: 0,
    });
    expect(
      await prisma.inventoryMovement.count({
        where: { type: 'RESERVATION_RELEASE' },
      }),
    ).toBe(1);
    await status(id, 'PREPARING').expect(409);
  });

  it('expires at local midnight, even with two workers, and preserves checked-in reservations', async () => {
    const expiredId = (await create(payload(1)).expect(201)).body.data.id;
    const presentId = (await create(payload(1)).expect(201)).body.data.id;
    await status(presentId, 'PREPARING').expect(200);
    await status(presentId, 'READY').expect(200);
    await status(presentId, 'CUSTOMER_PRESENT').expect(200);
    const beforeMidnight = new Date('2035-09-12T03:59:59Z');
    expect(await service.expireDueReservations(beforeMidnight)).toBe(0);
    const midnight = new Date('2035-09-12T04:00:00Z');
    const counts = await Promise.all([
      service.expireDueReservations(midnight),
      service.expireDueReservations(midnight),
    ]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(
      await prisma.reservation.findUnique({ where: { id: expiredId } }),
    ).toMatchObject({ status: 'EXPIRED' });
    expect(
      await prisma.reservation.findUnique({ where: { id: presentId } }),
    ).toMatchObject({ status: 'CUSTOMER_PRESENT' });
    expect(await stock()).toMatchObject({ reservedQuantity: 1 });
    expect(
      await prisma.inventoryMovement.count({
        where: { type: 'RESERVATION_RELEASE' },
      }),
    ).toBe(1);
  });

  it('commits expiration when an overdue request arrives before the worker', async () => {
    const id = (await create().expect(201)).body.data.id;
    await prisma.reservation.update({
      where: { id },
      data: {
        approximateTime: new Date('2000-01-01T10:00:00-04:00'),
        expiresAt: new Date('2000-01-02T04:00:00Z'),
      },
    });
    await status(id, 'PREPARING').expect(409);
    expect(
      await prisma.reservation.findUnique({ where: { id } }),
    ).toMatchObject({ status: 'EXPIRED' });
    expect(await stock()).toMatchObject({ reservedQuantity: 0 });
  });
});
