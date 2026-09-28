import { readFile } from 'node:fs/promises';
import { ConflictException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';
import { ReservationsRepository } from '../src/modules/reservations/reservations.repository.js';
import { createReservationNotification } from '../src/modules/notifications/reservation-notification.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Reservation notifications (HTTP and PostgreSQL)',
  () => {
    let ctx: Awaited<ReturnType<typeof cartTestContext>>;
    const staff: Array<{ id: number; token: string }> = [];
    const auth = (token = staff[0]!.token) => ({
      Authorization: 'Bearer ' + token,
    });
    const list = (query: object = {}, token?: string) =>
      request(ctx.app.getHttpServer())
        .get('/api/v1/notifications')
        .set(auth(token))
        .query(query);
    const count = (token?: string, query: object = {}) =>
      request(ctx.app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set(auth(token))
        .query(query);
    const read = (id: number | string, token?: string) =>
      request(ctx.app.getHttpServer())
        .patch('/api/v1/notifications/' + id + '/read')
        .set(auth(token));
    const reserve = (
      branchId = ctx.branch.id,
      quantity = 2,
      secondVariant = false,
    ) =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/reservations')
        .set(auth(ctx.tokens[0]))
        .send({
          branchId,
          approximateTime: '2035-09-12T15:00:00-04:00',
          items: [
            {
              productId: ctx.product.id,
              sizeId: ctx.size.id,
              colorId: ctx.color.id,
              quantity,
            },
            ...(secondVariant
              ? [
                  {
                    productId: ctx.product.id,
                    sizeId: ctx.otherSize.id,
                    colorId: ctx.color.id,
                    quantity: 3,
                  },
                ]
              : []),
          ],
        });
    beforeAll(async () => {
      ctx = await cartTestContext(databaseUrl!);
      const manager = await ctx.prisma.role.create({
        data: { name: 'BRANCH_MANAGER' },
      });
      const cashier = await ctx.prisma.role.create({
        data: { name: 'CASHIER' },
      });
      const password = 'NotificationsTest123!';
      const passwordHash = await hash(password, 10);
      for (let i = 0; i < 4; i++) {
        const user = await ctx.prisma.user.create({
          data: {
            name: 'Staff ' + i,
            email: 'staff' + i + '@notifications.test',
            passwordHash,
            roles: { create: { roleId: i === 3 ? cashier.id : manager.id } },
            employee: {
              create: {
                branchId: i === 2 ? ctx.otherBranch.id : ctx.branch.id,
                jobTitle: 'Test',
              },
            },
          },
        });
        const login = await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.email, password })
          .expect(201);
        staff.push({
          id: user.id,
          token: login.body.data.accessToken as string,
        });
      }
    }, 30000);
    beforeEach(async () => {
      vi.restoreAllMocks();
      await ctx.prisma.reservation.deleteMany();
      await ctx.prisma.inventoryMovement.deleteMany();
      await ctx.prisma.inventory.updateMany({
        data: { physicalQuantity: 10, reservedQuantity: 0 },
      });
      await ctx.prisma.employee.update({
        where: { userId: staff[0]!.id },
        data: { active: true, branchId: ctx.branch.id },
      });
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await ctx?.close();
    });

    it('creates one durable branch notice with all quantities and timezone-correct appointment', async () => {
      const reservation = (await reserve(ctx.branch.id, 2, true).expect(201))
        .body.data;
      const response = await list().expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.data).toMatchObject({
        unreadCount: 1,
        meta: { page: 1, total: 1, totalPages: 1 },
      });
      expect(response.body.data.data[0]).toMatchObject({
        reservationId: reservation.id,
        branchId: ctx.branch.id,
        unitCount: 5,
        approximateTime: '2035-09-12T19:00:00.000Z',
        createdAt: reservation.reservedAt,
        type: 'RESERVATION_CREATED',
        reservationStatus: 'PENDING',
        isRead: false,
        readAt: null,
        branch: { id: ctx.branch.id, name: ctx.branch.name },
      });
      expect(await ctx.prisma.notification.count()).toBe(1);
      expect(await ctx.prisma.notificationRead.count()).toBe(0);
    });

    it('isolates branches while allowing global and filtered administrator access', async () => {
      await reserve().expect(201);
      await reserve(ctx.otherBranch.id).expect(201);
      expect((await list().expect(200)).body.data.meta.total).toBe(1);
      expect(
        (await count(staff[2]!.token).expect(200)).body.data.unreadCount,
      ).toBe(1);
      expect(
        (await list({}, ctx.tokens[2]).expect(200)).body.data.meta.total,
      ).toBe(2);
      expect(
        (
          await count(ctx.tokens[2], { branchId: ctx.otherBranch.id }).expect(
            200,
          )
        ).body.data.unreadCount,
      ).toBe(1);
      await list({ branchId: ctx.otherBranch.id }).expect(403);
      await count(undefined, { branchId: ctx.otherBranch.id }).expect(403);
      const foreign = await ctx.prisma.notification.findFirstOrThrow({
        where: { branchId: ctx.otherBranch.id },
      });
      await read(foreign.id).expect(404);
      await read(2147483647).expect(404);
      expect(await ctx.prisma.notificationRead.count()).toBe(0);
    });

    it('requires a JWT and disallows customers and cashiers on every route', async () => {
      await reserve().expect(201);
      const notice = await ctx.prisma.notification.findFirstOrThrow();
      await request(ctx.app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(401);
      for (const token of [ctx.tokens[0]!, staff[3]!.token]) {
        await list({}, token).expect(403);
        await count(token).expect(403);
        await read(notice.id, token).expect(403);
      }
    });

    it('checks current employee status and reassignment with an existing JWT', async () => {
      await reserve().expect(201);
      const old = await ctx.prisma.notification.findFirstOrThrow();
      await ctx.prisma.employee.update({
        where: { userId: staff[0]!.id },
        data: { active: false },
      });
      await list().expect(403);
      await count().expect(403);
      await read(old.id).expect(403);
      await ctx.prisma.employee.update({
        where: { userId: staff[0]!.id },
        data: { active: true, branchId: ctx.otherBranch.id },
      });
      expect((await list().expect(200)).body.data.meta.total).toBe(0);
      await read(old.id).expect(404);
      await reserve(ctx.otherBranch.id).expect(201);
      expect((await list().expect(200)).body.data.meta.total).toBe(1);
    });

    it('preserves independent first-read timestamps under repeated and concurrent requests', async () => {
      await reserve().expect(201);
      const notice = await ctx.prisma.notification.findFirstOrThrow();
      const results = await Promise.all([
        read(notice.id),
        read(notice.id),
        read(notice.id),
      ]);
      expect(results.every((r) => r.status === 200)).toBe(true);
      const first = results[0]!.body.data;
      for (const result of results) expect(result.body.data).toEqual(first);
      expect(
        (await read(notice.id).send({ userId: staff[1]!.id }).expect(200)).body
          .data,
      ).toEqual(first);
      expect(await ctx.prisma.notificationRead.count()).toBe(1);
      expect((await count().expect(200)).body.data.unreadCount).toBe(0);
      expect(
        (await count(staff[1]!.token).expect(200)).body.data.unreadCount,
      ).toBe(1);
      expect(
        (await count(ctx.tokens[2]).expect(200)).body.data.unreadCount,
      ).toBe(1);
      expect((await list().expect(200)).body.data.data[0]).toMatchObject({
        isRead: true,
        readAt: first.readAt,
      });
    });

    it('paginates with a stable tie-breaker and keeps the counter independent of the page', async () => {
      await reserve().expect(201);
      await reserve().expect(201);
      await reserve().expect(201);
      await ctx.prisma.notification.updateMany({
        data: { createdAt: new Date('2026-09-12T12:00:00Z') },
      });
      const notices = await ctx.prisma.notification.findMany({
        orderBy: { id: 'desc' },
      });
      await read(notices[0]!.id).expect(200);
      const first = (await list({ limit: 1 }).expect(200)).body.data;
      expect(first.data[0].id).toBe(notices[0]!.id);
      expect(first.unreadCount).toBe(2);
      expect(first.meta).toMatchObject({ total: 3, totalPages: 3 });
      const unread = (
        await list({ limit: 1, page: 2, unreadOnly: 'true' }).expect(200)
      ).body.data;
      expect(unread.data[0].id).toBe(notices[2]!.id);
      expect(unread.meta).toMatchObject({ total: 2, totalPages: 2 });
      expect(unread.unreadCount).toBe(2);
      expect(
        (await list({ unreadOnly: 'false' }).expect(200)).body.data.meta.total,
      ).toBe(3);
    });

    it('validates pagination, filters and IDs instead of passing overflow to PostgreSQL', async () => {
      for (const query of [
        { page: 0 },
        { limit: 101 },
        { unreadOnly: 'yes' },
        { branchId: 2147483648 },
        { userId: staff[1]!.id },
      ])
        await list(query).expect(400);
      await count(undefined, { unreadOnly: 'true' }).expect(400);
      for (const id of ['abc', '-1', '0', '2147483648'])
        await read(id).expect(400);
    });

    it('rolls back the reservation and notice if the later stock operation fails', async () => {
      const repository = ctx.app.get(ReservationsRepository);
      vi.spyOn(repository, 'reserveStock').mockRejectedValueOnce(
        new ConflictException('Simulated stock conflict'),
      );
      await reserve().expect(409);
      expect(await ctx.prisma.reservation.count()).toBe(0);
      expect(await ctx.prisma.notification.count()).toBe(0);
      expect(await ctx.prisma.inventoryMovement.count()).toBe(0);
      expect(
        await ctx.prisma.inventory.count({
          where: { reservedQuantity: { gt: 0 } },
        }),
      ).toBe(0);
    });

    it('creates exactly one notice when concurrent reservations compete for the last stock', async () => {
      await ctx.prisma.inventory.updateMany({ data: { physicalQuantity: 2 } });
      const results = await Promise.all([reserve(), reserve()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await ctx.prisma.reservation.count()).toBe(1);
      expect(await ctx.prisma.notification.count()).toBe(1);
    });

    it('retains read history and shows the current status without duplicating creation events', async () => {
      const reservation = (await reserve().expect(201)).body.data;
      const notice = await ctx.prisma.notification.findFirstOrThrow();
      const receipt = (await read(notice.id).expect(200)).body.data;
      await ctx.prisma.$transaction(async (tx) => {
        const source = await tx.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
          include: { items: true },
        });
        await createReservationNotification(tx, source);
        await createReservationNotification(tx, source);
      });
      await request(ctx.app.getHttpServer())
        .patch('/api/v1/reservations/' + reservation.id + '/cancel')
        .set(auth(ctx.tokens[0]))
        .expect(200);
      expect(await ctx.prisma.notification.count()).toBe(1);
      expect((await list().expect(200)).body.data.data[0]).toMatchObject({
        reservationStatus: 'CANCELLED',
        isRead: true,
        readAt: receipt.readAt,
      });
    });

    it('backfills only open reservations when upgrading an existing database', async () => {
      const open = (await reserve(ctx.branch.id, 2, true).expect(201)).body
        .data;
      const closed = (await reserve().expect(201)).body.data;
      await ctx.prisma.reservation.update({
        where: { id: closed.id },
        data: { status: 'CANCELLED' },
      });
      // Recreate only the new tables in this test's isolated schema to simulate an upgrade.
      const sql = new Client({
        connectionString: databaseUrl,
        options: '-c search_path=' + ctx.schema,
      });
      await sql.connect();
      try {
        await sql.query(
          'DROP TABLE "lecturas_notificacion"; DROP TABLE "notificaciones";',
        );
        await sql.query(
          await readFile(
            new URL(
              '../prisma/migrations/20260914000000_reservation_notifications/migration.sql',
              import.meta.url,
            ),
            'utf8',
          ),
        );
      } finally {
        await sql.end();
      }
      const notices = await ctx.prisma.notification.findMany();
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        reservationId: open.id,
        unitCount: 5,
        createdAt: new Date(open.reservedAt),
        approximateTime: new Date(open.approximateTime),
      });
      expect((await count().expect(200)).body.data.unreadCount).toBe(1);
    });
  },
);
