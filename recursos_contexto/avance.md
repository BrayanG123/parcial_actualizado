
Orden recomendado de implementación

| Fase | Módulos | Resultado |
|---|---|---|
| 1 | Configuración, Prisma y componentes comunes | Aplicación conectada a PostgreSQL |
| 2 | Auth, usuarios, roles y sucursales | Seguridad y organización |
| 3 | Catálogo e inventario | Productos consultables con disponibilidad |
| 4 | Reservas y carrito | Flujo principal del cliente |
| 5 | Ventas y pagos | Compra presencial y digital |
| 6 | Vestidor virtual, IA y reportes | Funciones diferenciadoras |
| 7 | Pruebas, documentación y Azure | MVP demostrable y desplegado |


Plan de cuatro semanas
Semana 1: Fundación, seguridad y catálogo
Diseñar completamente las 23 entidades en schema.prisma.
Crear migración inicial y datos de prueba.
Configurar variables de entorno y validación.
Implementar PrismaModule.
Implementar autenticación JWT, hashing de contraseñas y roles.
Implementar usuarios, clientes, empleados y sucursales.
Implementar CRUD de:categorías;
tallas;
colores;
temporadas;
colecciones;
proveedores;
productos.

Incorporar validación de DTO y manejo uniforme de errores.
Hito: un usuario inicia sesión y consulta un catálogo administrable.
Semana 2: Inventario y reservas
Inventario por variante y sucursal.
Consulta de disponibilidad consolidada.
Movimientos de entrada, ajuste, devolución e ingreso pendiente.
Creación de reservas con múltiples prendas.
Flujo de estados:PENDIENTE;
PREPARANDO;
LISTA;
CLIENTE_PRESENTE;
ATENDIDA;
CANCELADA;
VENCIDA.

Liberación automática del stock reservado.
Pruebas de concurrencia para impedir sobreventa.
Hito: reservar prendas afecta correctamente la disponibilidad.
Semana 3: Carrito, ventas y pagos
Carrito activo por cliente.
Agregar, modificar y eliminar artículos.
Checkout web/móvil.
Registro de ventas presenciales.
Conversión opcional de reserva en venta.
Integración con Stripe en modo prueba.
Webhook de confirmación de pago.
Idempotencia para evitar pagos o ventas duplicadas.
Descuento automático del inventario al confirmar la venta.
Hito: compra completa desde carrito o caja, con actualización transaccional del inventario.
Semana 4: IA, vestidor virtual, reportes y despliegue
Recursos de realidad aumentada asociados con productos.
Endpoint para obtener recursos RA compatibles con la aplicación móvil.
Recomendaciones mediante una API de IA considerando preferencias, talla, temporada y stock.
Persistencia de RecomendacionIA.
Reportes básicos:ventas por sucursal;
productos más vendidos;
stock bajo;
reservas por estado;
ventas por canal.

Swagger/OpenAPI.
Pruebas E2E de los flujos críticos.
Docker y despliegue en Azure.
Hito: MVP desplegado y preparado para demostración.
Regla de trabajo por módulo
Cada módulo debería considerarse terminado solamente cuando incluya:
Modelos y migración Prisma.
DTO con validaciones.
Repositorio.
Servicio con reglas de negocio.
Controlador REST.
Autenticación y autorización.
Pruebas unitarias.
Al menos una prueba E2E.
Documentación Swagger.
Datos de prueba en seed.ts.
Prioridad para asegurar el MVP
Si el tiempo se reduce, priorizaría:
Autenticación y roles.
Catálogo.
Inventario por sucursal y variante.
Reservas.
Ventas.
Stripe en modo prueba.
Una recomendación de IA funcional.
Recursos RA como metadatos y URLs.
Los dashboards avanzados, notificaciones en tiempo real y automatizaciones sofisticadas pueden quedar como mejoras.

## Estado verificado — 12 de septiembre de 2026

- Implementados en el backend: configuración/Prisma, autenticación, usuarios y roles,
  sucursales, catálogo, productos, inventario y movimientos.
- **Reservas implementado:** creación con múltiples variantes, consultas por cliente
  y sucursal, permisos, estados de preparación y atención, cancelación, movimientos
  de reserva/liberación y protección transaccional frente a concurrencia.
- Vencimiento al finalizar el día de la cita en `America/La_Paz`; revisión al iniciar
  y cada minuto. Las reservas con cliente presente requieren cierre por el personal.
- Agregados migración de vencimiento, contrato OpenAPI, guía y seed opcional de reservas.
- **Carrito implementado:** uno activo por cliente, compartido entre web/móvil;
  agregar/sumar variantes, reemplazar cantidades, eliminar y vaciar; permisos por
  propietario, precios vigentes, disponibilidad por sucursal e historial preservado.
- El carrito no retiene stock. Informa cambios de precio, prendas no disponibles
  y sucursales capaces de atender toda la selección. Catálogo y carrito comparten
  cálculo decimal de precios. Agregados índice único parcial, OpenAPI, guía y seed opcional.
- **Ventas y checkout implementado:** ventas presenciales con pago registrado en
  caja, compra total/parcial de reservas, cotización y conversión del carrito en
  pedido web/móvil, historial por cliente/sucursal y comprobante interno JSON.
- Precios históricos e idempotencia por usuario; descuento físico al confirmar la
  venta y retención temporal durante checkout. Cancelación y vencimiento liberan
  el stock una sola vez, incluso ante solicitudes concurrentes.
- Checkout: plazo configurable de 15 minutos (`CHECKOUT_HOLD_MINUTES`), moneda
  predeterminada `BOB` (`SALES_CURRENCY`). El vencimiento de reservas sigue siendo
  al finalizar el día de la cita en `America/La_Paz`.
- Agregados migración de ventas, contrato OpenAPI, guía y seed opcional idempotente.
  La confirmación electrónica se invoca internamente desde el módulo de Pagos.
- **Pagos/Stripe implementado:** Payment Intents de tarjeta para web/móvil en modo
  prueba, claves existentes desde `.env`, webhook con firma y cuerpo original,
  validación de importe/moneda/propietario y confirmación idempotente de la venta.
- Revisión automática al iniciar y cada minuto para recuperar eventos perdidos,
  cancelar intentos de pedidos cancelados y procesar reembolsos tardíos. Solicitudes
  de reembolso persistidas y recuperables; un reembolso pendiente no se presenta
  como completado. Fallos terminales quedan visibles para revisión en Stripe.
- Agregados SDK oficial, migración de campos de pago y estado `REFUNDED`, contrato
  OpenAPI, guía de integración y comando explícito `npm run test:stripe:smoke`.
  El frontend todavía debe incorporar Payment Element/PaymentSheet.
- **Reportes implementado:** ventas completadas por moneda, sucursal, canal y día;
  productos más vendidos; inventario actual, stock bajo/agotado y entradas
  pendientes; reservas por estado y sucursal. Administrador global y encargado
  limitado a su sucursal, fechas de Bolivia, rangos acotados y detalle paginado.
- **Seed completo disponible:** `npm run prisma:seed:demo` incluye la carga base y
  agrega 3 sucursales DEMO, 6 empleados, 4 clientes, 12 productos con variantes,
  30 ventas completadas y 3 pedidos de otros estados, 7 reservas y carritos.
  Los pagos electrónicos del seed son ficticios y no llaman a Stripe.
- El seed base conserva contraseñas y stock existentes. La demostración se carga
  transaccionalmente y repetirla no duplica operaciones ni repone existencias.
  Guía compartible con instalación desde cero, cuentas, variables y comandos.
- Conexiones Prisma y seeds fijadas en UTC para evitar el desfase del adaptador
  con servidores PostgreSQL configurados en otra zona; los reportes agrupan en
  Bolivia. No se modificaron fechas históricas existentes.
- **Notificaciones de reservas implementado (RF11):** aviso persistente por reserva,
  creado en la misma transacción que la reserva y el stock. Lista paginada,
  contador de pendientes y marcado como leído individual por usuario.
- Administrador con alcance global y encargado activo limitado a su sucursal,
  con asignación verificada en cada consulta. Los cambios de estado conservan
  el aviso y muestran el estado actual de la reserva.
- Agregados dos modelos técnicos, migración con recuperación de avisos para
  reservas abiertas anteriores, guía y contrato OpenAPI. El seed DEMO genera
  siete avisos; repetirlo añade solo los faltantes y conserva las lecturas.
- Verificación: 122 pruebas unitarias y 73 E2E correctas (incluidos escenarios con
  PostgreSQL real y concurrencia), compilación, chequeo TypeScript y lint correctos.
  Migraciones y seed probados en una instancia temporal aislada; repetir el seed
  de ventas no duplica la venta ni vuelve a consumir inventario.
- También pasó una prueba contra la API real de Stripe con claves de prueba:
  pago normal, reutilización del intento, reembolso de pago vencido e inventario.
  Los cargos de prueba restantes se reembolsaron y el esquema aislado se eliminó.
- Aplicar `npm run prisma:migrate:deploy` a la base de desarrollo antes de iniciar
  esta versión. La base de desarrollo se llama `tienda_ropa`; su configuración
  existente se conservó y no se aplicaron migraciones ni seeds a esa base.
- **Siguientes módulos pendientes: IA y recursos de RA/vestidor virtual.**
  También quedan notificaciones push y devoluciones comerciales de ventas
  completadas (reembolsos parciales, disputas y ajustes de inventario asociados).

Documentación de uso: [Reservas](../backend/docs/reservas.md),
[Carrito](../backend/docs/carrito.md),
[Ventas y checkout](../backend/docs/ventas-checkout.md) y
[Pagos/Stripe](../backend/docs/pagos-stripe.md),
[Reportes](../backend/docs/reportes.md),
[Notificaciones](../backend/docs/notificaciones.md) e
[Instalación y seed](../backend/docs/instalacion-y-seed.md).

## Punto de continuación acordado

- Último trabajo terminado: **Notificaciones internas de reservas (RF11)**,
  después de Reportes y seed completo. Incluye pruebas, migración, datos DEMO
  y guía para integrar la campana en la web.
- Rutas disponibles: `GET /api/v1/notifications`,
  `GET /api/v1/notifications/unread-count` y
  `PATCH /api/v1/notifications/:id/read`.
- Canal de esta entrega: consultas REST desde la web, por ejemplo cada 30 segundos.
  La campana/lista visual todavía debe implementarse en el frontend; no hay
  WebSocket ni SSE. Consultar avisos no los marca leídos automáticamente.
- Aplicar `npm run prisma:generate` y `npm run prisma:migrate:deploy` desde
  `backend` antes de iniciar esta versión. Hay seis migraciones. El seed DEMO
  puede repetirse para añadir avisos que falten, sin reiniciar los datos anteriores.
- La configuración de `tienda_ropa` se conservó. Las verificaciones de esta
  implementación usaron una instancia temporal de PostgreSQL; no poblaron esa base.
- Las notificaciones push fuera de la aplicación, correos y avisos al cliente
  sobre cambios de estado son alcances adicionales por definir, no funcionalidades
  ya implementadas.
- Después siguen IA y recursos de RA/vestidor virtual. También están pendientes
  el despliegue en Azure y el flujo de devoluciones comerciales de ventas completadas.
