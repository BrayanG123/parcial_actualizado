# Reservas para prueba en sucursal

Implementado: creación con múltiples prendas, consultas por propietario y sucursal,
preparación, llegada del cliente, cierre de atención, cancelación y vencimiento.

## Activación

Desde `backend`:

```sh
npm run build
npm run prisma:migrate:deploy
npm run start:dev
```

La migración `20260912000000_reservation_expiration` agrega `expiresAt`, su índice
y una restricción de fecha. Las reservas anteriores reciben como vencimiento la
medianoche posterior al día de su cita en Bolivia. Debe aplicarse antes de iniciar
el backend actualizado. No cambia cantidades de inventario durante la migración.

`RESERVATION_TIME_ZONE=America/La_Paz` es el valor predeterminado. Cambiarlo afecta
las nuevas reservas; cada reserva conserva el vencimiento que se calculó al crearla.

## API

Prefijo predeterminado: `/api/v1`. Todas las rutas requieren
`Authorization: Bearer <accessToken>`.

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/reservations` | Cliente autenticado |
| GET | `/reservations/mine` | Reservas propias del cliente |
| GET | `/reservations` | Administrador o encargado, limitado a su sucursal |
| GET | `/reservations/:id` | Propietario, administrador o encargado de la sucursal |
| PATCH | `/reservations/:id/status` | Administrador o encargado de la sucursal |
| PATCH | `/reservations/:id/cancel` | Propietario, administrador o encargado de la sucursal |

Los listados aceptan `page`, `limit` (máximo 100), `branchId`, `status`, `from` y `to`.
Las fechas filtran el horario de atención, no la fecha de creación; usar timestamps
con zona horaria para evitar ambigüedad. La consulta del encargado es la cola de
preparación de su sucursal. No se implementaron notificaciones push o en tiempo real.

Ejemplo de creación (reemplazar los IDs por variantes con stock y usar una fecha futura):

```json
{
  "branchId": 1,
  "approximateTime": "2030-09-11T15:00:00-04:00",
  "observation": "Probar camisa y pantalón",
  "items": [
    { "productId": 1, "sizeId": 1, "colorId": 1, "quantity": 1 },
    { "productId": 2, "sizeId": 2, "colorId": 1, "quantity": 1 }
  ]
}
```

No se acepta `clientId`: se obtiene del JWT y del perfil del usuario. Máximo 50
variantes distintas y 100 unidades por variante. Se rechazan combinaciones duplicadas,
sucursales inactivas, variantes inválidas, falta de stock y fechas pasadas o sin zona.
Si falla una prenda, no se conserva ninguna parte de la operación.

Las respuestas exitosas usan `{ success: true, data, timestamp }`; para un listado,
`data` contiene `{ data: [...], meta: { page, limit, total, totalPages } }`.
Los detalles incluyen cliente, sucursal, producto, talla y color, sin credenciales.

Contrato importable en Swagger Editor u otra herramienta OpenAPI:
[reservations.openapi.json](./reservations.openapi.json). Es un documento estático;
no se ha agregado una interfaz Swagger al servidor.

## Estados y stock

```text
PENDING → PREPARING → READY → CUSTOMER_PRESENT → COMPLETED
```

Para cambiar estado: `PATCH /reservations/:id/status` con `{ "status": "PREPARING" }`.
Se rechazan saltos y retrocesos. Se puede pasar a `CANCELLED` desde un estado abierto.
El cliente solo puede cancelar su propia reserva antes de `CUSTOMER_PRESENT`.
Repetir una cancelación o el último cambio de estado no duplica movimientos.

- Crear incrementa `reservedQuantity` y registra movimientos `RESERVATION`.
- `READY` marca los detalles como `PREPARED`.
- Cancelar, vencer o completar libera los detalles pendientes/preparados,
  los marca `RETURNED` y registra `RESERVATION_RELEASE`.
- La cantidad física no cambia por una reserva ni por el cierre de atención.
- `COMPLETED` representa atención terminada; no crea ni cobra una venta.
  Para comprar, [Ventas](./ventas-checkout.md) consume las unidades elegidas,
  registra `purchasedQuantity`, marca los detalles correspondientes `PURCHASED`
  y libera las unidades restantes en su propia transacción. Esos detalles no se liberan de nuevo.

Las operaciones usan transacciones `Serializable` y hasta tres reintentos adicionales
ante `P2034`, según la [documentación de transacciones de Prisma](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).
La transacción incluye cabecera, detalles, inventario y movimientos. Los conflictos
de negocio devuelven HTTP 409; las comprobaciones de permisos se repiten en las escrituras.

## Vencimiento al finalizar el día

Una cita del 11 de septiembre, hora Bolivia, vence el 12 a las 00:00 en Bolivia
(`04:00Z`). El vencimiento es exclusivo: a esa hora ya se puede liberar el stock.
Solo vencen `PENDING`, `PREPARING` y `READY`. `CUSTOMER_PRESENT` requiere cierre por
el personal para no interrumpir una atención iniciada.

El proceso corre al iniciar la aplicación y cada 60 segundos. Recupera reservas
vencidas durante una interrupción y procesa lotes de 100. La liberación puede ocurrir
hasta aproximadamente un minuto después del límite, mientras la aplicación esté
activa. Si se intenta cambiar una reserva vencida antes de que corra el proceso,
la operación la vence, libera stock y devuelve 409. Las consultas reflejan el estado
persistido. Los fallos se registran y se vuelven a intentar en el siguiente ciclo.

## Datos de demostración

Tras cargar el seed base, configurar `SEED_CUSTOMER_EMAIL` y
`SEED_CUSTOMER_PASSWORD` y ejecutar:

```sh
npm run prisma:seed:reservations
```

Este seed opcional crea un cliente si no existe y una reserva de una unidad para
el día siguiente usando el servicio real. Afecta el stock reservado y genera su
movimiento. Repetirlo secuencialmente reutiliza la reserva de demostración existente,
aunque ya esté cerrada. No modifica contraseñas ni roles de cuentas existentes.

## Verificación

```sh
npm test -- --no-file-parallelism
npm run lint
npm run build
```

Para HTTP, JWT, Prisma y concurrencia contra PostgreSQL real (PowerShell):

```powershell
$env:TEST_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/base_de_pruebas'
npm run test:e2e -- --no-file-parallelism
```

La prueba crea un esquema aleatorio `reservations_test_*`, aplica las migraciones,
carga datos aislados y elimina únicamente ese esquema al terminar. Sin
`TEST_DATABASE_URL`, estos escenarios se omiten explícitamente. Verifica el flujo
completo, permisos, validaciones, reserva simultánea de la última unidad,
cancelaciones concurrentes, dos procesos de vencimiento y protección del cliente presente.

La conversión en venta presencial está disponible en Ventas y el cobro electrónico
en Pagos/Stripe. Los avisos internos de creación están implementados en
[Notificaciones](./notificaciones.md). Quedan pendientes las pantallas web/móvil
y los canales push o en tiempo real.
