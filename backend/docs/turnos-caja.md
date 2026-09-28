# Turnos de caja y arqueo (MVP)

## Probar en la presentacion

1. Iniciar sesion como cajero, encargado o administrador y entrar en `/caja`.
   El administrador selecciona sucursal; el empleado usa la de su perfil.
2. Seleccionar una caja libre, indicar el efectivo inicial y pulsar **Abrir turno**.
3. Realizar las ventas normales o cobrar una reserva. El resumen separa efectivo,
   tarjeta, QR y transferencia y muestra la cantidad de ventas.
4. Terminar o vaciar el ticket y resolver cualquier cobro pendiente. Pulsar
   **Cerrar y arquear turno**, introducir el efectivo contado y confirmar.
   Si hay diferencia, escribir una observacion.
5. Consultar **Turnos y arqueos** (`/caja/turnos`) para revisar el cierre guardado.
   Para continuar vendiendo, abrir otro turno.

Ejemplo: saldo inicial 100, ventas en efectivo 160 y ventas QR 80.
El efectivo esperado es **260**, las ventas totales son **240**. Si se cuentan
250, el arqueo registra un faltante de **10**. El efectivo entregado de mas
por el cliente y devuelto como cambio no incrementa la venta.

## Reglas simples

- Cada persona abre y cierra su propio turno. Tambien aplica al administrador
  o encargado cuando utilizan el POS.
- Una persona puede tener un solo turno abierto y una caja puede estar ocupada
  por una sola persona. Para dos cajeros simultaneos se usan dos cajas.
- La migracion crea **Caja 1** en cada sucursal existente. Las nuevas sucursales
  creadas desde la API tambien reciben Caja 1. El administrador puede agregar
  otras cajas desde el formulario de apertura.
- El turno fija caja, sucursal y moneda. Las ventas nuevas requieren `shiftId`
  y solo se registran en un turno propio abierto en esa sucursal.
- El cierre es definitivo. Efectivo esperado = saldo inicial + ventas en efectivo.
  Diferencia = efectivo contado - efectivo esperado. Los otros medios se
  contabilizan por separado. Este MVP no agrega retiros ni aportes intermedios.
- Los cajeros consultan sus turnos de la sucursal asignada; los encargados,
  los de su sucursal; el administrador puede consultar todas las sucursales.
- Un cierre no modifica inventario ni crea ventas. Las ventas anteriores a esta
  etapa mantienen `shiftId = null` y no se suman artificialmente a un turno nuevo.

## Persistencia y concurrencia

Migracion: `20260916000000_cash_shifts`. Agrega `cajas`, `turnos_caja` y la
referencia opcional `ventas.id_turno`. No elimina datos existentes.
En otra instalacion: `npm run prisma:migrate:deploy` y `npm run prisma:generate`.
Reiniciar el backend despues de actualizar el codigo y cliente Prisma.

Indices unicos parciales impiden turnos abiertos duplicados por usuario y caja.
La apertura lleva una clave UUID y los reintentos con los mismos datos devuelven
el resultado original. El cierre del mismo turno con el mismo conteo y nota
tambien puede repetirse; otros datos posteriores al cierre se rechazan.

Cada venta actualiza sus totales de turno, pago y stock dentro de la misma
transaccion serializable. El cierre escribe la misma fila de turno: si compite
con una venta, se reintenta la transaccion para incluir toda venta confirmada,
o se rechaza una venta que llego despues del cierre.

Un reintento de una venta ya registrada puede recuperar su resultado incluso
despues de cerrar el turno. Un ticket nuevo no puede usar ese turno cerrado.
En React, un error de conexion conserva los datos de apertura/cierre para
**Reintentar turno**. Al recargar se consulta el turno actual en el servidor;
un cierre ya confirmado se encuentra en el historial.

## API

Todas las rutas requieren autenticacion y rol ADMINISTRATOR, BRANCH_MANAGER o
CASHIER. Solo ADMINISTRATOR puede crear cajas.

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/cash/registers?branchId=...` | Cajas y ocupacion de una sucursal |
| POST | `/cash/registers` | Crear caja: `branchId`, `name` |
| GET | `/cash/shifts/current` | Turno propio abierto o `null` |
| POST | `/cash/shifts` | Abrir: `registerId`, `openingCash`, `openingKey` |
| POST | `/cash/shifts/:id/close` | Cerrar: `countedCash`, `note` opcional salvo diferencia |
| GET | `/cash/shifts?page=1&limit=15&branchId=...` | Historial paginado segun permisos |

`POST /sales/in-store` ahora exige `shiftId`. Las ventas digitales mantienen
su circuito independiente.

## Verificacion

`npm test`, `npm run build` y `npm run lint` en backend y frontend.
Con `TEST_DATABASE_URL` apuntando a PostgreSQL local:
`npm run test:e2e -- test/sales.e2e-spec.ts test/catalog-foundation.e2e-spec.ts`.
Las pruebas usan esquemas temporales separados de los datos de la presentacion.

Se cubren apertura/cierre, efectivo frente a otros medios, faltantes,
permisos por sucursal y propietario, reintentos concurrentes, caja ocupada,
venta contra cierre, cambio de turno y recuperacion de un cobro anterior.
Las [ventas offline](ventas-offline.md) ya estan integradas: una descarga activa bloquea el cierre hasta sincronizar y finalizar. Checkout web/Stripe, contra entrega e IA siguen pendientes.
