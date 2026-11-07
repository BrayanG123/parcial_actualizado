import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';
import { seedPlatformAdmin } from '../prisma/seeds/platform.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

/** F14: un dueño con varias empresas, cada una aislada y con su propio plan. */
describe.skipIf(!databaseUrl)(
  'Cuenta de dueño con varias empresas (HTTP + PostgreSQL)',
  () => {
    let ctx: Awaited<ReturnType<typeof cartTestContext>>;
    const http = () => request(ctx.app.getHttpServer());
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
    const password = 'Duena1234';
    const signup = (slug: string, email: string, planCode = 'FREE') =>
      http()
        .post('/api/v1/saas/signup')
        .send({
          name: `Tienda ${slug}`,
          slug,
          planCode,
          admin: { name: 'Duena', email, password },
        });
    const ownerLogin = async (email: string, secret = password) =>
      (
        await http()
          .post('/api/v1/owner/auth/login')
          .send({ email, password: secret })
          .expect(200)
      ).body.data.accessToken as string;

    beforeAll(async () => {
      ctx = await cartTestContext(databaseUrl!);
    }, 60_000);
    afterAll(async () => ctx?.close());

    it('registra al dueño, lista sus empresas, crea otra con otro plan y entra a cada una', async () => {
      await signup('duena-uno', 'duena@varias.test', 'BASIC').expect(201);
      // El mismo correo ya tiene cuenta: la segunda empresa se crea desde "Mis empresas".
      await signup('duena-dos', 'duena@varias.test').expect(409);

      const owner = await ownerLogin('duena@varias.test');
      const creada = await http()
        .post('/api/v1/owner/tenants')
        .set(bearer(owner))
        .send({
          name: 'Tienda Dos',
          slug: 'duena-dos',
          planCode: 'PROFESSIONAL',
        })
        .expect(201);
      expect(creada.body.data).toMatchObject({ slug: 'duena-dos' });

      const lista = (
        await http().get('/api/v1/owner/tenants').set(bearer(owner)).expect(200)
      ).body.data as Array<{
        id: number;
        slug: string;
        subscription: { plan: { code: string; monthlyPrice: number } };
        stats: {
          branches: number;
          staff: number;
          salesThisMonth: { count: number };
        };
      }>;
      expect(lista.map((t) => [t.slug, t.subscription.plan.code])).toEqual([
        ['duena-dos', 'PROFESSIONAL'],
        ['duena-uno', 'BASIC'],
      ]);
      expect(lista[1]!.subscription.plan.monthlyPrice).toBe(99);
      expect(lista[0]!.stats).toMatchObject({
        branches: 0,
        staff: 1,
        salesThisMonth: { count: 0 },
      });

      // Entrar a cada empresa da la sesion de su administrador (la misma que su login).
      const [dos, uno] = lista;
      const sesionUno = (
        await http()
          .post(`/api/v1/owner/tenants/${uno!.id}/session`)
          .set(bearer(owner))
          .expect(200)
      ).body.data;
      expect(sesionUno.tenant.slug).toBe('duena-uno');
      expect(sesionUno.user.roles[0].role.name).toBe('ADMINISTRATOR');
      const sesionDos = (
        await http()
          .post(`/api/v1/owner/tenants/${dos!.id}/session`)
          .set(bearer(owner))
          .expect(200)
      ).body.data;
      const planDe = async (token: string) =>
        (
          await http()
            .get('/api/v1/tenant/subscription')
            .set(bearer(token))
            .expect(200)
        ).body.data.plan.code;
      expect(await planDe(sesionUno.accessToken)).toBe('BASIC');
      expect(await planDe(sesionDos.accessToken)).toBe('PROFESSIONAL');

      // Aun siendo del mismo dueño, las empresas siguen aisladas: una sucursal de "uno" no existe en "dos".
      const sucursal = (
        await http()
          .post('/api/v1/branches')
          .set(bearer(sesionUno.accessToken))
          .send({ name: 'Centro', city: 'La Paz', address: 'Calle 1' })
          .expect(201)
      ).body.data;
      await http()
        .get(`/api/v1/branches/${sucursal.id}`)
        .set(bearer(sesionDos.accessToken))
        .expect(404);
      const conSucursal = (
        await http().get('/api/v1/owner/tenants').set(bearer(owner)).expect(200)
      ).body.data.find((t: { slug: string }) => t.slug === 'duena-uno');
      expect(conSucursal.stats).toMatchObject({
        branches: 1,
        activeBranches: 1,
      });
    });

    it('no deja entrar a empresas de otro dueño ni usar el token de dueño dentro de una empresa', async () => {
      await signup('otro-negocio', 'otro@dueno.test').expect(201);
      const otro = await ownerLogin('otro@dueno.test');
      const mias = (
        await http().get('/api/v1/owner/tenants').set(bearer(otro)).expect(200)
      ).body.data;
      expect(mias.map((t: { slug: string }) => t.slug)).toEqual([
        'otro-negocio',
      ]);

      const ajena = await ctx.prisma.tenant.findUniqueOrThrow({
        where: { slug: 'duena-uno' },
      });
      await http()
        .post(`/api/v1/owner/tenants/${ajena.id}/session`)
        .set(bearer(otro))
        .expect(404);
      // El token de dueño no opera dentro de una empresa, y un token de empresa no abre el portal.
      await http().get('/api/v1/tenant/subscription').set(bearer(otro)).expect(401);
      await http()
        .get('/api/v1/owner/tenants')
        .set(bearer(ctx.tokens[2]!))
        .expect(401);
      await http()
        .post('/api/v1/owner/auth/login')
        .send({ email: 'otro@dueno.test', password: 'Incorrecta1' })
        .expect(401);
      await http().get('/api/v1/owner/tenants').expect(401);
    });

    it('la plataforma vincula una empresa nueva a la cuenta existente del mismo correo', async () => {
      await seedPlatformAdmin(ctx.prisma, {
        email: 'plataforma@owner.test',
        password: 'Plataforma123',
        saltRounds: 10,
      });
      const platform = (
        await http()
          .post('/api/v1/platform/auth/login')
          .send({ email: 'plataforma@owner.test', password: 'Plataforma123' })
          .expect(200)
      ).body.data.accessToken;
      await http()
        .post('/api/v1/platform/tenants')
        .set(bearer(platform))
        .send({
          name: 'Tienda Tres',
          slug: 'duena-tres',
          planCode: 'FREE',
          admin: {
            name: 'Duena',
            email: 'duena@varias.test',
            password: 'OtraClave123',
          },
        })
        .expect(201);
      const owner = await ownerLogin('duena@varias.test');
      const slugs = (
        await http().get('/api/v1/owner/tenants').set(bearer(owner)).expect(200)
      ).body.data.map((t: { slug: string }) => t.slug);
      expect([...slugs].sort()).toEqual(['duena-dos', 'duena-tres', 'duena-uno']);
    });
  },
);
