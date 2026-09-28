# POS conectado a React

Esta etapa integra la venta presencial existente en NestJS con `/caja` en React.
Los turnos de caja requieren la migracion explicada en [turnos y arqueo](turnos-caja.md). No se requieren credenciales de servicios externos para el POS.

## Recorrido para la presentacion

1. Iniciar el backend y React con `VITE_USE_MOCKS=false`.
2. Entrar como administrador, encargado o cajero. El administrador selecciona
   sucursal; los empleados usan la de su perfil activo.
3. Abrir un turno propio seleccionando caja y saldo inicial. En **Punto de venta**, buscar una prenda, elegir talla y color y agregar
   cantidades segun disponibilidad. Se puede vender a consumidor final o buscar
   un cliente por nombre/correo. El backend aplica su condicion mayorista.
4. Pulsar **Revisar total**. NestJS calcula los precios vigentes, descuentos,
   moneda y total. Esta consulta no modifica stock ni registra pagos.
5. Para efectivo, introducir el importe recibido y revisar el cambio. Para
   tarjeta, QR o transferencia, confirmar el pago externo e introducir su
   referencia. Estos metodos registran un pago ya realizado; no ejecutan una
   transaccion bancaria desde React.
6. Confirmar el cobro. Se registra venta, pago y movimiento de stock en la misma
   transaccion. Ver o imprimir el comprobante y consultar el historial.

## Venta desde una reserva

En Reservas, preparar las prendas y marcar **Cliente presente**. El enlace
**Pasar a caja** precarga la sucursal y el numero; pulsar **Cargar reserva**.
El cliente queda fijado a la reserva. Reducir las cantidades si compra solo una
parte. Al cobrar, el backend descuenta las unidades compradas y libera las
restantes. Si no compra nada, cerrar la atencion desde Reservas.

El cajero puede cargar una reserva de su sucursal para cobrarla. Esto no le da
permisos generales para modificar reservas ni administrar clientes.

## Cambios puntuales en NestJS

- `POST /sales/in-store/preview`: misma seleccion y reglas de precio/stock que
  el cobro, sin persistir una venta.
- `GET /sales/in-store/customers?branchId=...&search=...`: busqueda de clientes
  activos, minimo 2 caracteres, maximo 20 resultados; devuelve solo identificador,
  nombre, correo y condicion mayorista.
- `GET /sales/in-store/reservations/:id?branchId=...`: prendas y cliente de una
  reserva con cliente presente, sin venta previa y en la sucursal autorizada.

Las tres rutas requieren ADMINISTRATOR, BRANCH_MANAGER o CASHIER. La logica de
cotizacion se comparte con `POST /sales/in-store`; la confirmacion vuelve a
validar precios y stock para detectar cambios posteriores a la revision.

## Historial y recuperacion

React usa `/sales` para operaciones, `/sales/mine` para compras del cliente y
`/sales/:id/receipt` para comprobantes de ventas completadas. Las fechas del
filtro incluyen el dia completo en Bolivia (UTC-4). Los precios y nombres del
comprobante son los guardados al vender, aunque el catalogo cambie despues.

Antes de enviar un cobro, React guarda el payload y su clave de idempotencia en
`sessionStorage`, separados por usuario y API. Si la respuesta se pierde, se
bloquea un nuevo ticket y **Reintentar confirmacion** envia exactamente el mismo
cobro. Tambien se recupera tras recargar esa pestana. No volver a cobrar al cliente.
No borrar los datos de esa pestana mientras haya una confirmacion pendiente.

La apertura de turno por cajero, cierre y arqueo ya estan integrados; ver [guia de turnos](turnos-caja.md). Las [ventas offline](ventas-offline.md) cuentan con una pantalla propia, cola persistente y sincronizacion antes del cierre. Checkout web/Stripe, contra entrega e IA siguen
pendientes de su etapa.

## Verificacion

- `frontend`: `npm test`, `npm run build`, `npm run lint`.
- `backend`: `npm test`, `npm run build`, `npm run lint`.
- Con `TEST_DATABASE_URL` apuntando a PostgreSQL local:
  `npm run test:e2e -- test/sales.e2e-spec.ts`.
  El helper crea y elimina su propio esquema temporal.

Las pruebas cubren contratos, descuentos por unidad, efectivo insuficiente,
referencia de pago, recuperacion de respuesta perdida, comprobantes, precio
mayorista, permisos por sucursal, conversion parcial de reservas, concurrencia
y reintentos sin duplicacion.
