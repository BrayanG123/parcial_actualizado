# Reportes

El módulo ofrece agregados de ventas, productos, inventario y reservas para los
dashboards. Las consultas se ejecutan en PostgreSQL con parámetros; no descargan
todo el historial al servidor para calcularlo. No requiere tablas nuevas.

## Acceso

Todas las rutas llevan prefijo `/api/v1/reports` y requieren JWT.
El administrador puede consultar todas las sucursales o una mediante `branchId`.
El encargado necesita un perfil de empleado activo y queda limitado a su sucursal,
incluso si omite el filtro. Solicitar otra sucursal responde 403.
Clientes, cajeros y proveedores no tienen acceso a este módulo.

| Ruta GET | Contenido |
|---|---|
| `/sales` | Totales por moneda, sucursal, canal y día |
| `/top-products` | Productos más vendidos, separados por moneda |
| `/inventory` | Existencias actuales, stock bajo/agotado y entradas pendientes |
| `/reservations` | Cantidad de reservas por sucursal y estado |

Se mantiene `{ success: true, data, timestamp }`. Contrato importable:
[reports.openapi.json](./reports.openapi.json).

## Fechas y ventas

Ventas, productos más vendidos y reservas admiten `from` y `to` en formato
`YYYY-MM-DD`. Ambos días están incluidos, en `America/La_Paz` (UTC−4).
Por defecto se consultan los últimos 30 días hasta hoy; si solo se envía `to`,
el inicio será 29 días antes. Se permiten de 1 a 366 días, entre 1900 y 2100.
Fechas imposibles, rangos invertidos o excesivos responden 400.

Las conexiones Prisma del backend y los seeds fijan la sesión PostgreSQL en UTC
para conservar los instantes con el adaptador instalado. La conversión a Bolivia
se hace al agrupar los reportes. No se cambia la zona global de PostgreSQL ni se
reescriben fechas históricas. Este ajuste evita el comportamiento descrito en el
[reporte del adaptador Prisma](https://github.com/prisma/prisma/issues/28629).

```text
GET /api/v1/reports/sales?from=2026-09-01&to=2026-09-30
GET /api/v1/reports/sales?branchId=2&channel=WEB&currency=BOB
GET /api/v1/reports/top-products?from=2026-09-01&to=2026-09-30&limit=10
```

Ventas y top de productos aceptan `channel` (`IN_STORE`, `WEB`, `MOBILE`) y
`currency` (código de tres letras mayúsculas).

**Solo se cuentan ventas `COMPLETED`.** La fecha de referencia es `confirmedAt`;
para registros antiguos sin esa fecha se usa `soldAt`. Pendientes, canceladas,
reembolsadas y borradores no aumentan los ingresos. No se cuenta una venta varias
veces aunque tenga varios registros de pago.

La respuesta de `/sales` incluye:

- `period`: fechas, zona horaria e instantes inicial y final exclusivo.
- `filters`: filtros y sucursal efectiva autorizada.
- `totals`: un resumen por moneda.
- `byBranch`, `byChannel`, `daily`: desgloses para gráficos.

Cada resumen contiene `saleCount`, `unitsSold`, `revenue` y `averageTicket`.
`revenue` es el total de ventas después de descuentos; **no es utilidad** ni saldo
liquidado por Stripe. No se calculan costos, comisiones ni impuestos. Los importes
de monedas distintas nunca se suman en un único total. Días sin ventas se omiten;
el frontend puede completar esos días con ceros.

`/top-products` devuelve `items` con `productId`, `productName`, `currency`,
`unitsSold`, `saleCount`, `revenue` y `rank`. Ordena por unidades descendentes,
desempata por ingresos y por ID. `limit` admite 1–100 (10 por defecto) **por moneda**.
El nombre mostrado es el actual del catálogo; cantidades e ingresos proceden de
los detalles históricos (`cantidad × (precio_unitario − descuento_por_unidad)`).
Cambiar el precio actual del producto no modifica esos importes.

Los desgloses de una misma consulta de ventas usan una transacción de lectura
repetible para obtener una vista consistente mientras se registran nuevas compras.

### Ventas por hora

`/sales` también devuelve `hourly`: las mismas métricas agrupadas por **hora local de Bolivia** (0 a 23) según la fecha de confirmación. Las horas sin ventas no aparecen; la web completa el horario comercial (8 a 21) con ceros.

## Cajas y turnos

```text
GET /api/v1/reports/cash-shifts?from=2026-09-01&to=2026-09-30
GET /api/v1/reports/cash-shifts?branchId=2&registerId=4
```

Incluye los turnos **abiertos** dentro del periodo, por fecha de apertura en días de Bolivia. Acepta los mismos permisos y el mismo alcance por sucursal que el resto de reportes, y además `registerId` para filtrar una caja.

- `totals`: por moneda, con `shiftCount`, `openShifts`, `saleCount`, `cash`, `card`, `qr`, `transfer`, `total`, `difference` y `shiftsWithDifference`.
- `byRegister`: las mismas métricas por caja y sucursal.
- `shifts`: hasta 100 turnos, del más reciente al más antiguo. Cada uno trae cajero, apertura y cierre, montos por medio de pago, `expectedCash` (saldo inicial + efectivo), `countedCash` y `difference`.

`difference` es el efectivo contado menos el esperado: negativo es faltante y positivo es sobrante. Solo existe en turnos cerrados; en los abiertos vale `null` y no suma al total. Los importes provienen de los acumulados que la venta registra en el turno, así que coinciden con el arqueo del cierre.

La IA de reportes también reconoce solicitudes de cajas, turnos o arqueo (`cash-shifts`) y de ventas por hora.

## Inventario

```text
GET /api/v1/reports/inventory
GET /api/v1/reports/inventory?branchId=2&lowStockOnly=true&lowStockThreshold=5
GET /api/v1/reports/inventory?categoryId=1&productId=3&page=1&limit=20
```

Es una fotografía del stock **actual**; no admite fechas históricas.
Filtros: `branchId`, `categoryId`, `productId`, `lowStockOnly` (`true`/`false`).
Paginación: `page` desde 1 y `limit` de 1 a 100. Umbral `lowStockThreshold` de 0 a
100.000, predeterminado 5.

- `physical`: cantidad física.
- `reserved`: unidades apartadas por reservas y checkouts.
- `available = physical − reserved`.
- `incoming`: unidades de movimientos `PENDING_ENTRY` que siguen en `PENDING`.
- Stock bajo: disponibilidad menor o igual al umbral, incluidos agotados.
- Agotado: disponibilidad igual a cero.

Devuelve `summary`, `byBranch`, `items` paginados y `meta`. Los resúmenes abarcan
todo el conjunto filtrado, no solo la página; al filtrar `lowStockOnly=true`,
también los resúmenes corresponden solo a ese subconjunto.
Cada fila representa una variante en una sucursal, no un producto único.
Incluye productos y sucursales inactivos para no ocultar existencias, e informa
`productActive` y `branchActive`. Solo se cuentan variantes con registro de inventario.

## Reservas

```text
GET /api/v1/reports/reservations?from=2026-09-01&to=2026-09-30&branchId=2
```

Filtra por **horario de la cita**, no por fecha de creación. Devuelve `items` con
`branchId`, `branchName`, `status` y `count`. Los estados sin reservas no aparecen.

## Datos y verificación

Para poblar la base de desarrollo con datos útiles, seguir
[Instalación y seed](./instalacion-y-seed.md). La carga DEMO contiene ventas de
tres canales, descuentos, reservas de todos los estados y stock bajo.

```powershell
npm test -- --no-file-parallelism
npm run lint
npm run build
$env:TEST_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/base_de_pruebas'
npm run test:e2e -- --no-file-parallelism
```

Las pruebas verifican permisos, filtros, límites de fechas en Bolivia, separación
de monedas, descuentos, pagos múltiples, stock pendiente y repetición del seed.
La exportación CSV/PDF y la interfaz de los dashboards no forman parte de estas
rutas JSON.
