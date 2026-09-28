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
