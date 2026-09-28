import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('Own profile (HTTP and PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof cartTestContext>>;
  const me = (token?: string) => {
    const req = request(ctx.app.getHttpServer()).patch('/api/v1/auth/me');
    return token ? req.set({ Authorization: `Bearer ${token}` }) : req;
  };

  beforeAll(async () => {
    ctx = await cartTestContext(databaseUrl!);
  }, 30000);
  afterAll(async () => ctx?.close());

  it('lets a customer update name, phone and address and clear them', async () => {
    const updated = (
      await me(ctx.tokens[0])
        .send({
          name: '  Ana Perez ',
          phone: '+591 70000000',
          address: 'Av. Arce 123, La Paz',
        })
        .expect(200)
    ).body.data;
    expect(updated).toMatchObject({
      name: 'Ana Perez',
      email: 'customer@cart.test',
      client: { phone: '+591 70000000', address: 'Av. Arce 123, La Paz' },
    });
    const current = (
      await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set({ Authorization: `Bearer ${ctx.tokens[0]}` })
        .expect(200)
    ).body.data;
    expect(current.name).toBe('Ana Perez');

    const cleared = (
      await me(ctx.tokens[0]).send({ phone: '', address: '' }).expect(200)
    ).body.data;
    expect(cleared.client).toMatchObject({ phone: null, address: null });
    // El otro cliente no cambia.
    expect(
      (
        await ctx.prisma.user.findUniqueOrThrow({
          where: { id: ctx.users[1]!.id },
        })
      ).name,
    ).toBe('other@cart.test');
  });

  it('keeps privileged fields out of self-service and validates input', async () => {
    await me().send({ name: 'Sin token' }).expect(401);
    for (const body of [
      { email: 'otro@cart.test' },
      { password: 'NuevaClave123!' },
      { roles: ['ADMINISTRATOR'] },
      { wholesale: true },
      { name: 'A' },
      { phone: 'abc' },
    ])
      await me(ctx.tokens[0]).send(body).expect(400);
    // Una cuenta sin perfil de cliente puede cambiar su nombre, no datos de cliente.
    expect(
      (await me(ctx.tokens[2]).send({ name: 'Administrador' }).expect(200)).body
        .data.name,
    ).toBe('Administrador');
    await me(ctx.tokens[2]).send({ phone: '70000000' }).expect(400);
  });
});
