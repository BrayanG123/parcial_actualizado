import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const token = 'fcm-token-de-prueba-0123456789:APA91bExample';

describe.skipIf(!databaseUrl)('Push tokens (HTTP and PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const server = () => ctx.app.getHttpServer();
  const admin = () => ({ Authorization: `Bearer ${ctx.tokens[2]!}` });
  const customer = () => ({ Authorization: `Bearer ${ctx.tokens[0]!}` });

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
  }, 30000);
  afterAll(async () => ctx?.close());

  it('lets staff register and remove their devices, but not customers', async () => {
    expect(
      (
        await request(server())
          .get('/api/v1/push/status')
          .set(admin())
          .expect(200)
      ).body.data,
    ).toEqual({ enabled: false });

    await request(server())
      .post('/api/v1/push/tokens')
      .set(customer())
      .send({ token })
      .expect(403);
    await request(server())
      .post('/api/v1/push/tokens')
      .send({ token })
      .expect(401);

    await request(server())
      .post('/api/v1/push/tokens')
      .set(admin())
      .send({ token, platform: 'WEB' })
      .expect(200);
    // Registrar dos veces el mismo navegador no duplica filas.
    await request(server())
      .post('/api/v1/push/tokens')
      .set(admin())
      .send({ token })
      .expect(200);
    expect(await ctx.prisma.pushToken.findMany()).toEqual([
      expect.objectContaining({
        token,
        userId: ctx.users[2]!.id,
        platform: 'WEB',
      }),
    ]);

    await request(server())
      .post('/api/v1/push/tokens')
      .set(admin())
      .send({ token: 'corto' })
      .expect(400);

    expect(
      (
        await request(server())
          .delete('/api/v1/push/tokens')
          .set(admin())
          .send({ token })
          .expect(200)
      ).body.data,
    ).toEqual({ removed: true });
    expect(await ctx.prisma.pushToken.count()).toBe(0);
  });
});
