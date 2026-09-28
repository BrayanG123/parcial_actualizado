# Ventas y checkout

El módulo registra ventas presenciales, convierte reservas atendidas en ventas,
genera pedidos digitales a partir del carrito y conserva precios, pagos y
movimientos de inventario. Incluye consultas por cliente/sucursal y comprobante
interno JSON para ventas completadas.

## Activación y configuración

La base de desarrollo del proyecto es **`tienda_ropa`**, configurada en `DATABASE_URL`.
Desde `backend`, aplicar las migraciones antes de iniciar esta versión:

```sh
npm run build
npm run prisma:migrate:deploy
npm run start:dev
```

`20260912020000_sales_checkout` incorpora la relación venta-carrito, datos de
idempotencia, moneda, plazo del checkout, nombres históricos de las prendas,
cantidades compradas de una reserva y movimientos `CHECKOUT_HOLD`/`CHECKOUT_RELEASE`.
Los cambios se probaron en PostgreSQL temporal; no se aplicaron automáticamente
a `tienda_ropa`.

```dotenv
CHECKOUT_HOLD_MINUTES=15
SALES_CURRENCY=BOB
```

El plazo admite de 1 a 120 minutos. La moneda se almacena en cada venta y no cambia
si posteriormente se modifica la configuración. La integración de Pagos deberá
configurar una moneda compatible en el proveedor y validar que coincide con la venta.

## Rutas y permisos

Prefijo predeterminado `/api/v1`; todas las rutas requieren JWT.

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/sales/in-store` | Cajero/encargado de su sucursal o administrador |
| POST | `/sales/checkout/preview` | Cliente, carrito propio |
| POST | `/sales/checkout` | Cliente, carrito propio |
| GET | `/sales/mine` | Historial del cliente autenticado |
| GET | `/sales` | Cajero/encargado limitado a su sucursal; administrador global |
| GET | `/sales/:id` | Cliente propietario o personal autorizado de la sucursal |
| GET | `/sales/:id/receipt` | Mismos permisos; solo ventas `COMPLETED` |
| PATCH | `/sales/:id/cancel` | Propietario o personal autorizado; solo ventas digitales pendientes |

Los listados aceptan `page`, `limit` (hasta 100), `branchId`, `channel`, `status`,
`from` y `to`. Las fechas filtran `soldAt`. Respuesta habitual:
`{ success: true, data, timestamp }`. Un listado incluye dentro de `data` los
campos `data` y `meta`. Las rutas POST responden 201; consultas y cancelación, 200.

Errores: 400 por datos inválidos, 401 sin JWT, 403 por permisos, 404 por recurso
inexistente/no propio y 409 por stock, precios, estados, idempotencia o referencias
de pago en conflicto.

Contrato importable: [sales.openapi.json](./sales.openapi.json).

## Venta presencial

Registrar el pago que el personal ya recibió en caja:

```json
{
  "idempotencyKey": "460c3a53-569d-4d82-a12a-ae85107b36c5",
  "branchId": 1,
  "clientId": 1,
  "items": [
    { "productId": 1, "sizeId": 1, "colorId": 1, "quantity": 2 }
  ],
  "expectedTotal": 499.80,
  "paymentMethod": "CASH"
}
```

`clientId` es opcional para ventas a un comprador sin cuenta. Sustituir los IDs y
el total por los datos reales del catálogo. El backend calcula los importes y
rechaza un `expectedTotal` distinto para que el cajero revise el precio antes de
registrar el pago. No acepta precios ni descuentos arbitrarios por línea.

Métodos: `CASH`, `CARD`, `QR`, `BANK_TRANSFER`. Para los tres últimos se requiere
`paymentReference` (máximo 175 caracteres): registra una transacción ya cobrada
externamente, sin conectarse a un terminal o banco. La referencia se guarda con
prefijo `IN_STORE:<método>:` y es única.

En una sola transacción se guardan venta `COMPLETED`, pago `APPROVED`, detalles,
descuento físico de existencias y movimientos `SALE`. No se consumen unidades
apartadas por otras reservas/checkouts. Máximo 50 variantes distintas, 100 unidades
por variante y un total positivo que quepa en `Decimal(12,2)`.

El comprobante contiene número `FS-00000001`, precios, descuentos, nombres
históricos, sucursal, pago y comprador cuando existe. Es un comprobante interno
JSON; no se agregó generación de PDF ni facturación fiscal.

## Comprar algunas prendas de una reserva

Agregar `reservationId` a la venta presencial. La reserva debe estar en
`CUSTOMER_PRESENT`, pertenecer a la misma sucursal y no tener una venta previa.
El cliente se obtiene de la reserva; si se envía `clientId`, debe coincidir.

`items` puede contener solo las variantes elegidas y cantidades menores que las
reservadas. No admite prendas ajenas a esa reserva. La operación:

1. Descuenta físicamente las unidades compradas y registra `SALE`.
2. Libera todas las unidades apartadas por esa reserva; para las no compradas
   registra `RESERVATION_RELEASE`.
3. Guarda `purchasedQuantity` en cada detalle; los que tienen compras quedan
   `PURCHASED` y los demás `RETURNED`.
4. Marca la reserva `COMPLETED` y la vincula con su única venta.

Ejemplo: reservar 3 camisas y comprar 1 reduce la existencia física en 1 y la
cantidad reservada en 3. `quantity=3` y `purchasedQuantity=1` conservan el historial.
Cancelar una reserva ya convertida no vuelve a liberar inventario.

## Checkout digital

Primero solicitar una cotización con `POST /sales/checkout/preview`:

```json
{ "cartId": 1, "branchId": 1 }
```

Se valida el carrito activo propio y la disponibilidad de todas sus líneas en
esa sucursal. Devuelve importes actuales, moneda, detalles y `quoteHash`. La vista
previa no retiene stock.

Después de mostrar y aceptar ese importe, enviar `POST /sales/checkout`:

```json
{
  "cartId": 1,
  "branchId": 1,
  "channel": "WEB",
  "quoteHash": "copiar_el_hash_de_64_caracteres_de_la_vista_previa",
  "idempotencyKey": "5fa1c85e-d374-4c48-afdf-f2c1cdb777f2"
}
```

`channel` admite `WEB` o `MOBILE`. Si cambió el carrito o el precio, se devuelve 409
y hay que solicitar una cotización nueva. El servidor siempre vuelve a comprobar
stock y precios; el hash no sustituye la autorización ni las validaciones.

Al aceptar el checkout se guarda una venta `PENDING_PAYMENT`, un pago electrónico
`PENDING`, los importes de compra y `expiresAt`. El carrito pasa a `CONVERTED` y su
contenido se conserva como historial. Se incrementa `reservedQuantity` y se
registran movimientos `CHECKOUT_HOLD`; aún no disminuye la existencia física.

Consultar `/cart` después crea otro carrito activo vacío. Un carrito convertido
no se vuelve a usar para otro checkout. Si el pedido se cancela o vence, conserva
su historial; para intentar una nueva compra, el cliente puede agregar las prendas
del pedido a su nuevo carrito y cotizar nuevamente.

`unitPrice` en los detalles de venta es el precio base; `discount` es el descuento
**por unidad**; `netUnitPrice = unitPrice - discount` y
`subtotal = quantity × netUnitPrice`. Los cálculos usan decimales y los precios de
la venta quedan congelados. No se cobra un precio nuevo por cambios posteriores
del catálogo.

## Confirmación de pago y vencimiento

La integración con Stripe está implementada en el [módulo de Pagos](./pagos-stripe.md)
mediante Payment Intents en modo prueba, webhook firmado y revisión automática.
No hay una ruta HTTP que permita al cliente aprobar su propio pago.

La operación interna utilizada por Pagos es:

```typescript
await salesService.confirmElectronicPayment(saleId, {
  reference: providerTransactionId,
  amount: '499.80',
  currency: 'BOB',
});
```

**Pagos la invoca después de verificar el proveedor**, la firma del webhook cuando
corresponde, la relación con la venta y el importe. La operación comprueba moneda y total,
aprueba el pago, consume la retención (cantidad física y reservada), registra
`SALE` y marca `COMPLETED` en la misma transacción. La referencia se almacena con
prefijo `GATEWAY:` y no puede usarse para dos ventas. Repetir la misma confirmación
no vuelve a descontar stock.

Cancelar un pedido pendiente o dejar vencer su plazo libera la retención mediante
`CHECKOUT_RELEASE`, marca la venta `CANCELLED` y el pago pendiente `VOIDED`. El
proceso de vencimiento corre al arrancar y cada minuto, recupera pedidos vencidos
durante interrupciones y revalida su estado dentro de la transacción.

Una confirmación tardía también libera un pedido vencido antes de responder 409.
Si Stripe ya cobró, Pagos solicita el reembolso total y conserva el trabajo pendiente
para reintentos. Las ventas completadas no se anulan por la ruta de cancelación de
pedidos pendientes; su devolución comercial sigue requiriendo un flujo separado.

## Idempotencia y concurrencia

Enviar un UUID v4 nuevo por operación lógica y **reutilizarlo en sus reintentos**.
La clave se limita al usuario creador. La misma clave y datos devuelven la misma
venta, aun después de finalizarla/cancelarla; datos distintos con esa clave
responden 409. Una reserva y un carrito se vinculan a una única venta.

Se usan transacciones serializables con reintentos acotados, conforme a la
[documentación de Prisma](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).
Inventario, movimientos, detalles, pagos y conversión se confirman o revierten
juntos. No se mantiene una transacción de base de datos abierta durante una llamada
de red al proveedor.

## Demostración y pruebas

Después de cargar el seed base, ejecutar opcionalmente:

```sh
npm run prisma:seed:sales
```

Usa el administrador definido en `SEED_ADMIN_EMAIL`, registra una venta en efectivo
y consume una unidad disponible. Repetirlo no duplica esa venta. Ejecutarlo solo
cuando se quiera crear ese dato de demostración.

```sh
npm test -- --no-file-parallelism
npm run lint
npm run build
```

Pruebas HTTP/Prisma/concurrencia con base aislada, en PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/base_de_pruebas'
npm run test:e2e -- --no-file-parallelism
```

Las pruebas usan esquemas temporales aleatorios, migraciones y usuarios con JWT
reales. Verifican ventas en caja, pagos registrados, comprobantes, compra parcial
de reservas, cotizaciones, idempotencia, competencia por la última unidad,
confirmaciones/cancelaciones concurrentes y vencimiento. Sin `TEST_DATABASE_URL`,
los escenarios de PostgreSQL se omiten explícitamente.
