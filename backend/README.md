# FashionStore API

Backend del MVP de comercio electrónico construido con NestJS, Prisma y
PostgreSQL.

## Preparación local

1. Copie `.env.example` como `.env` y ajuste `DATABASE_URL`.
2. Cree una base de datos PostgreSQL llamada `tienda_ropa`.
3. Instale dependencias con `npm install`.
4. Aplique el esquema con `npm run prisma:migrate:deploy`.
5. Cargue los datos iniciales con `npm run prisma:seed`.
6. Inicie la API con `npm run start:dev`.

La API utiliza por defecto el prefijo `http://localhost:3000/api/v1`.

Para publicar la imagen Docker del backend en Azure Container Apps, seguir el
[manual de despliegue en Azure](../docs/despliegue-azure.md). Incluye PostgreSQL,
secretos, migraciones, datos de demostración, verificación y control de costos
para una cuenta Azure for Students.

Para instalar el proyecto en otro equipo y poblar una base vacía, seguir la
[guía de instalación y seed](docs/instalacion-y-seed.md). La carga completa se
ejecuta con `npm run prisma:seed:demo` e incluye el seed base, usuarios de prueba,
catálogo, inventario, reservas y ventas históricas. Requiere `SEED_DEMO_PASSWORD`.

## SaaS multitenant (parcial 2)

Base PostgreSQL compartida con **aislamiento lógico por empresa** (`empresas`,
`planes`, `suscripciones`, `historial_suscripciones`; `id_empresa` en toda tabla de
negocio). Diseño y casos de uso: [ICONIX parcial 2](../docs/ICONIX_Parcial2.md).

- **Empresa de cada petición** (`src/common/tenant/tenant-context.ts`,
  `src/modules/tenancy/tenant.middleware.ts`): empresa del JWT si hay token válido;
  si no, header `X-Tenant: <slug>`; si no, `DEFAULT_TENANT_SLUG` (`fashionstore`,
  para las apps del parcial 1). Header distinto al token → 403 `TENANT_MISMATCH`;
  slug inexistente → 404.
- **Aislamiento en backend** (`src/database/prisma/tenant-isolation.extension.ts`):
  extensión de Prisma que agrega `tenantId` a todo `where` y a toda alta (también
  anidada) de los modelos con empresa. Un recurso de otra empresa "no existe" (404).
  Sin contexto la consulta falla (fail closed) y la columna `id_empresa` tiene un
  default de BD que también falla si la aplicación no la envía. Las consultas
  `$queryRaw` filtran `id_empresa` explícitamente (`reports.repository.ts`, `ml.repository.ts`). Jobs y
  webhook de Stripe se ejecutan por empresa (`TenantsService.forEachTenant`).
- **Planes** configurables en la tabla `planes` (`maxActiveBranches`, `features`):
  `@RequiresFeature('aiReports' | 'conventionalReports' | 'offline' …)` lo verifica
  `TenantAccessInterceptor` después del JWT → 403 `PLAN_FEATURE_REQUIRED`. Crear o
  reactivar una sucursal por encima del límite → 403 `PLAN_LIMIT_REACHED`.
- **Suscripción vencida o suspendida → solo lectura**: GET y login permitidos; toda
  otra escritura de la empresa → 403 `SUBSCRIPTION_READ_ONLY`. El vencimiento se
  registra solo (`EXPIRE` en el historial) al detectarse.
- Los errores de estas reglas incluyen `code` en el cuerpo para que la UI muestre
  mensajes claros.

| Ruta | Acceso | Uso |
|---|---|---|
| `GET /tenant/directory` | público | Empresas activas (slug, nombre) para el selector |
| `GET /tenant/public` | público | Empresa resuelta por `X-Tenant` |
| `GET /tenant/subscription` | personal y clientes | Plan, funcionalidades, límites, uso, vencimiento, `readOnly` |
| `POST /platform/auth/login` | público | Login del administrador de plataforma (`PLATFORM_ADMIN`, sin empresa) |
| `GET/POST /platform/plans`, `PATCH /platform/plans/:id` | `PLATFORM_ADMIN` | Planes y sus límites |
| `GET/POST /platform/tenants`, `GET/PATCH /platform/tenants/:id` | `PLATFORM_ADMIN` | Empresas (alta con suscripción y administrador) |
| `POST /platform/tenants/:id/admins` | `PLATFORM_ADMIN` | Designar administrador de empresa |
| `PATCH /platform/tenants/:id/subscription/plan` | `PLATFORM_ADMIN` | Cambio de plan (409 `PLAN_LIMIT_EXCEEDED` si el uso no cabe) |
| `POST /platform/tenants/:id/subscription/{renew,suspend,reactivate}` | `PLATFORM_ADMIN` | Renovación simulada (sin cobro), suspensión, reactivación |
| `GET /platform/tenants/:id/subscription/history` | `PLATFORM_ADMIN` | Historial de la suscripción |

Login de personal/clientes: `POST /auth/login` con `X-Tenant` (sin header usa la
empresa por defecto). El email es único **por empresa**. Pruebas:
`test/tenancy.e2e-spec.ts` y `src/database/prisma/tenant-isolation.extension.spec.ts`.

### Calidad: seguridad y rendimiento (F10)

**Pruebas automáticas de seguridad** (corren con `npx vitest run`):

- `src/common/security/route-access.spec.ts` inventaría las 151 rutas desde los
  decoradores. Exige JWT en toda ruta que no esté en la lista pública revisada, que los
  roles se verifiquen con `RolesGuard`, que la plataforma no comparta rutas con las
  empresas, que cada módulo pida la funcionalidad de su plan (`sales`, `reservations`,
  `products` en escrituras, `offline`, reportes, IA y ML) y que solo las operaciones
  revisadas se permitan en modo solo lectura.
- `src/common/security/raw-sql.spec.ts`: toda consulta `$queryRaw` filtra
  `id_empresa` y no se usan variantes `Unsafe` ni `Prisma.raw`.
- `src/database/prisma/schema-indexes.spec.ts`: cada tabla con empresa tiene un índice
  que empieza por `tenantId`, y los `@@unique` sin empresa están acotados por un padre de
  una sola empresa.
- `src/common/filters/http-exception.filter.spec.ts`: los errores conocidos de Prisma
  se traducen (`UNIQUE_CONSTRAINT` 409, `RELATED_RECORD` 409, `NOT_FOUND` 404) sin
  devolver valores ni nombres de tablas, y el log de un error de Prisma guarda solo
  código y modelo (el mensaje de Prisma incluye datos de la consulta).

Hallazgo corregido: las banderas `products`, `reservations` y `sales` de los planes
eran configurables pero casi no se verificaban; ahora un plan sin reservas las bloquea
(403 `PLAN_FEATURE_REQUIRED`, `test/tenancy.e2e-spec.ts`) y el menú web las oculta.
Dependencias: `npm audit --omit=dev` sin vulnerabilidades altas ni críticas en el
backend (Nest 12.3, Prisma 7.10.1). En la web quedan las de `firebase` (el arreglo que
propone npm es bajar de versión mayor) y en el móvil no se tocaron las versiones que fija
Expo SDK 57.

**Rendimiento (RNF09)**, medido con `EXPLAIN ANALYZE` en PostgreSQL 16 sobre una base
sintética de 2 empresas, 180 000 ventas, 450 000 líneas y 15 000 variantes:

| Consulta | Antes | Después | Nota |
|---|---|---|---|
| Ventas por sucursal, 30 días (empresa grande) | 47 ms (recorre sus 150 000 ventas) | 31 ms | índice `(id_empresa, estado, fecha_confirmacion)` |
| Igual, empresa chica | 9,8 ms (lee 60 000 filas) | 1,4 ms | ya no paga el volumen de la otra empresa |
| Ventas por sucursal, 365 días | 208 ms | ~220 ms | domina el detalle (70 000 ventas útiles) |
| Listado de ventas del panel (20 filas) | 0,1 ms | — | índice `(id_empresa, fecha)` |
| Catálogo público por categoría | 0,07 ms | — | |
| Inventario de una sucursal (descarga offline) | 1,1 ms | — | acotada a 2 000 variantes y 500 clientes |
| Ventas semanales para ML (156 semanas) | 437 ms | — | lectura completa intencional; solo al entrenar |

Los reportes filtran por `COALESCE(fecha_confirmacion, fecha)`, que ningún índice
cubre; `reportingDateBetween` lo reescribe como dos rangos equivalentes para usar el
índice nuevo (migración `20261030000000_report_indexes`). No se usó un índice de
expresión porque Prisma no lo representa en el schema y `migrate dev` lo borraría. Los
listados paginan (20 por defecto, máximo 100).

## Cambios de prendas y notas de crédito (parcial 2)

`src/modules/exchanges`. Plazo configurable por empresa (`PATCH /tenant/settings`
`{ exchangeWindowDays }`, administrador; 7 días por defecto). `GET /exchanges/sales/:saleId`
muestra las líneas cambiables, el plazo y las prendas candidatas de la sucursal;
`POST /exchanges` registra el cambio en una transacción serializable: la prenda devuelta
vuelve al stock (kardex `RETURN`), la nueva se descuenta (kardex `SALE`) y la diferencia se
cobra en efectivo al turno (`CHARGED`) o queda como **nota de crédito** (`CREDIT_NOTE`,
aporte propio): `GET /credit-notes/:code` y `POST /credit-notes/:code/redeem`. Una línea no
puede cambiarse más veces que su cantidad (control optimista + `CHECK` en la base). Offline
se envía como operación `EXCHANGE` de `/sync/operations`. Pruebas: `test/exchanges.e2e-spec.ts`.

## Reservas

El módulo permite reservar varias prendas por sucursal, gestionar su atención y
liberar stock por cancelación o vencimiento al finalizar el día en Bolivia.
Antes de iniciar, aplicar las migraciones pendientes con `npm run prisma:migrate:deploy`.

Ver [guía de Reservas](docs/reservas.md) y
[contrato OpenAPI](docs/reservations.openapi.json) para rutas, permisos, estados,
datos de demostración y pruebas de concurrencia.

## Carrito

Para el carrito activo del cliente, ver la [guía de Carrito](docs/carrito.md)
y su [contrato OpenAPI](docs/cart.openapi.json). Incluye consultas, cantidades,
precios vigentes y disponibilidad por sucursal; el checkout corresponde a Ventas/Pagos.

## Ventas y checkout

Implementados ventas presenciales, compra parcial de reservas, checkout digital
con stock apartado, idempotencia, historial y comprobante interno. La confirmación
electrónica se integra con el módulo de Pagos/Stripe.
Ver [guía de Ventas y checkout](docs/ventas-checkout.md).

## Pagos / Stripe

Implementados Payment Intents de tarjeta en modo prueba, webhook con firma y
cuerpo original, confirmación idempotente, recuperación automática y reembolso
de pagos de pedidos cancelados/vencidos. Configurar las tres variables `STRIPE_*`
en `.env`. Ver [guía de Pagos](docs/pagos-stripe.md) y
[contrato OpenAPI](docs/payments.openapi.json).

## Reportes

Ventas por moneda/sucursal/canal/día, productos más vendidos, stock actual y
reservas por estado. Acceso para administradores y encargados de su sucursal.
Ver [guía de Reportes](docs/reportes.md) y [OpenAPI](docs/reports.openapi.json).

## Notificaciones de reservas

Avisos persistentes al crear una reserva, lista paginada, contador y lectura
individual para administradores y encargados de la sucursal. La campana web puede
consultar la API periódicamente. Incluye migración y siete avisos en el seed DEMO.
Ver [guía de Notificaciones](docs/notificaciones.md) y
[OpenAPI](docs/notifications.openapi.json).

## Comandos de base de datos

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:dev -- --name nombre_del_cambio
npm run prisma:migrate:deploy
npm run prisma:seed
npm run prisma:seed:demo
npm run prisma:studio
```

---

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
