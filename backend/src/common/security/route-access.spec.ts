import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type RouteInfo, routeInventory } from './route-inventory.js';

/**
 * Auditoria de autorizacion de TODAS las rutas (F10.4). Nest no tiene un guard global en
 * este proyecto: cada controlador declara su autenticacion, asi que una ruta nueva sin
 * guard quedaria publica sin que nadie lo note. Esta prueba lo impide.
 */
async function allRoutes(): Promise<RouteInfo[]> {
  const root = join(__dirname, '../..');
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.controller.ts'));
  const controllers: Array<new (...args: never[]) => unknown> = [];
  for (const file of files)
    for (const value of Object.values(
      (await import(join(root, file))) as Record<string, unknown>,
    ))
      if (typeof value === 'function')
        controllers.push(value as new (...args: never[]) => unknown);
  return routeInventory(controllers);
}

/** Rutas publicas revisadas una por una. Agregar aqui solo despues de revisarlas. */
const PUBLIC_ROUTES = [
  'GET /', // estado de la API
  'GET /ai/status', // proveedor activo, sin claves
  'POST /ai/assistant', // asistente de compras: limitado por AiRateLimitGuard
  'POST /auth/login',
  'POST /auth/register',
  'POST /platform/auth/login',
  'POST /payments/stripe/webhook', // autenticado por la firma de Stripe
  'GET /tenant/directory', // empresas activas (nombre y codigo)
  'GET /tenant/public',
  // Catalogo publico de la tienda (lectura), siempre dentro de la empresa resuelta.
  'GET /branches',
  'GET /branches/:id',
  'GET /catalog/categories',
  'GET /catalog/categories/:id',
  'GET /catalog/collections',
  'GET /catalog/collections/:id',
  'GET /catalog/colors',
  'GET /catalog/colors/:id',
  'GET /catalog/seasons',
  'GET /catalog/seasons/:id',
  'GET /catalog/sizes',
  'GET /catalog/sizes/:id',
  'GET /inventory/availability',
  'GET /products',
  'GET /products/:id',
  'GET /products/:productId/ar-resources',
  'GET /virtual-fitting/status',
];
const key = (r: RouteInfo) => `${r.method} ${r.path}`;
const authenticated = (r: RouteInfo) =>
  r.guards.includes('JwtAuthGuard') ||
  r.guards.includes('OptionalJwtAuthGuard');

/** Funcionalidad de plan exigida por prefijo de ruta. */
const FEATURE_BY_PREFIX: Array<[RegExp, string[], (r: RouteInfo) => boolean]> =
  [
    [/^\/sales\/offline\//, ['offline'], () => true],
    [/^\/sales(\/|$)/, ['sales'], () => true],
    [/^\/(cash|cart|exchanges|credit-notes)(\/|$)/, ['sales'], () => true],
    [/^\/payments\//, ['sales'], (r) => r.path !== '/payments/stripe/webhook'],
    [/^\/reservations(\/|$)/, ['reservations'], () => true],
    [/^\/sync\//, ['offline'], () => true],
    [/^\/reports\//, ['conventionalReports'], () => true],
    [/^\/ai\/reports$/, ['aiReports'], () => true],
    [/^\/ml\//, ['mlAnalytics'], () => true],
    [
      /^\/(products|catalog)(\/|$)/,
      ['products'],
      (r) => r.method !== 'GET' || r.path.startsWith('/catalog/suppliers'),
    ],
  ];

describe('autorizacion de las rutas', () => {
  let routes: RouteInfo[];
  beforeAll(async () => {
    routes = await allRoutes();
  });

  it('inventaria todas las rutas de los controladores', () => {
    expect(routes.length).toBeGreaterThan(140);
    expect(new Set(routes.map(key)).size).toBe(routes.length);
  });

  it('toda ruta sin JWT esta en la lista publica revisada', () => {
    const open = routes.filter((r) => !authenticated(r)).map(key);
    expect(open.sort()).toEqual([...PUBLIC_ROUTES].sort());
    // Las rutas publicas solo leen, salvo login, registro, webhook y asistente.
    const writes = open.filter((k) => !k.startsWith('GET '));
    expect(writes.sort()).toEqual([
      'POST /ai/assistant',
      'POST /auth/login',
      'POST /auth/register',
      'POST /payments/stripe/webhook',
      'POST /platform/auth/login',
    ]);
  });

  it('los roles siempre se verifican con RolesGuard y viceversa', () => {
    const rolesWithoutGuard = routes.filter(
      (r) => r.roles.length && !r.guards.includes('RolesGuard'),
    );
    const guardWithoutRoles = routes.filter(
      (r) => !r.roles.length && r.guards.includes('RolesGuard'),
    );
    expect(rolesWithoutGuard.map(key)).toEqual([]);
    expect(guardWithoutRoles.map(key)).toEqual([]);
    // RolesGuard sin JWT no tendria usuario que verificar.
    expect(
      routes
        .filter(
          (r) =>
            r.guards.includes('RolesGuard') &&
            !r.guards.includes('JwtAuthGuard'),
        )
        .map(key),
    ).toEqual([]);
  });

  it('la plataforma y las empresas no comparten rutas', () => {
    const platform = routes.filter(
      (r) =>
        r.path.startsWith('/platform/') && r.path !== '/platform/auth/login',
    );
    expect(platform.length).toBeGreaterThan(10);
    expect(
      platform.filter((r) => r.roles.join() !== 'PLATFORM_ADMIN').map(key),
    ).toEqual([]);
    expect(
      routes
        .filter(
          (r) =>
            !r.path.startsWith('/platform') &&
            r.roles.includes('PLATFORM_ADMIN'),
        )
        .map(key),
    ).toEqual([]);
  });

  it('cada modulo exige la funcionalidad de su plan', () => {
    const missing: string[] = [];
    for (const r of routes) {
      const rule = FEATURE_BY_PREFIX.find(
        ([prefix, , applies]) => prefix.test(r.path) && applies(r),
      );
      if (rule && !rule[1].includes(r.feature ?? ''))
        missing.push(`${key(r)} (${r.feature ?? 'sin funcionalidad'})`);
    }
    expect(missing).toEqual([]);
  });

  it('solo consultas y operaciones sin efecto de negocio se permiten en modo solo lectura', () => {
    // La plataforma no pertenece a ninguna empresa: el modo solo lectura no le aplica.
    const readOnlyWrites = routes
      .filter(
        (r) =>
          r.method !== 'GET' &&
          r.allowWhenReadOnly &&
          !r.path.startsWith('/platform/'),
      )
      .map(key);
    expect(readOnlyWrites.sort()).toEqual([
      'DELETE /push/tokens',
      'POST /ai/reports', // solo consulta
      'POST /auth/login',
      'POST /payments/stripe/webhook', // confirma pagos ya iniciados
      'POST /push/tokens',
      // Acepta el lote y marca cada operacion como conflicto SUBSCRIPTION_INVALID.
      'POST /sync/operations',
    ]);
  });
});
