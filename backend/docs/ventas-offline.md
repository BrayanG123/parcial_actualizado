# Ventas offline y PWA para la presentacion

> **Parcial 2:** la PWA usa IndexedDB y el contrato `/sync/operations` (ver
> "Contrato unificado de sincronización" y "PWA offline (parcial 2)" al final).
> Las secciones siguientes describen el flujo por lote del parcial 1, que se conserva
> por compatibilidad: sus tickets pendientes se migran automáticamente.

## Preparacion

La migracion `20260917000000_offline_sales` agrega los lotes de descarga y su
relacion con las ventas. Ya se aplico en la base local de este trabajo.
En otra instalacion ejecutar `npm run prisma:migrate:deploy` y
`npm run prisma:generate` en backend. Reiniciar el backend actualizado.

En frontend, detener el servidor de desarrollo que ocupe el puerto 5173 y ejecutar:

```powershell
npm run build
npm run preview -- --port 5173 --strictPort
```

Abrir `http://localhost:5173` con Chrome o Edge. Mantener la misma direccion y el
mismo navegador durante toda la prueba. Usar `VITE_USE_MOCKS=false` y verificar
que `VITE_API_URL` apunta al backend real. El origen de preview debe estar
permitido en `CORS_ORIGINS`; por eso se utiliza el mismo puerto del desarrollo.
En un servidor remoto se necesita HTTPS.

El build genera manifest, icono y service worker. Este descarga todas las
pantallas y recursos locales, incluidos los modulos cargados bajo demanda.
Puede instalarse desde el navegador, pero no hace falta instalarlo para probar.
No se usa el cache HTTP para registrar ventas ni para responder consultas de la API.

## Recorrido de prueba

1. Con internet, iniciar sesion como cajero, encargado o administrador y abrir
   el turno de caja. Resolver cualquier cobro de la caja normal pendiente.
2. Entrar en **Ventas offline** (`/caja/offline`) y pulsar
   **Descargar y activar modo offline**. Esperar a que aparezcan las prendas.
3. Desconectar internet (o activar Offline en las herramientas del navegador).
   Recargar la pagina para demostrar que sigue abriendo.
4. Seleccionar prenda/talla/color, introducir efectivo recibido y pulsar
   **Cobrar y guardar ticket local**. Mostrar el cambio y el identificador del
   ticket. Se indica que todavia no tiene numero de venta del servidor.
5. Registrar otro ticket y comprobar que el stock local disminuye. Recargar:
   los tickets siguen en la cola.
6. Recuperar internet. Con la pagina de caja offline abierta, la sincronizacion
   se intenta al reconectar y cada 15 segundos. Tambien existe **Sincronizar ahora**.
7. Esperar a que no queden pendientes. Los tickets pasan a mostrar su numero de
   venta y comprobante. No cobrar otra vez al cliente.
8. Pulsar **Finalizar modo offline**, regresar a caja y hacer el arqueo normal.
   Las ventas sincronizadas ya se incluyen en efectivo y cantidad de ventas.

## Alcance sencillo del MVP

- Ventas en efectivo a consumidor final. Clientes mayoristas, reservas y otros
  medios de pago utilizan el POS normal con conexion.
- El turno se abre con internet. Solo puede tener una descarga offline activa,
  asociada a un dispositivo. El POS normal y el cierre quedan bloqueados hasta
  finalizar esa descarga.
- Precios validos para registrar tickets durante 24 horas desde la preparacion.
  Se puede sincronizar mas tarde, conservando el turno abierto. Para seguir
  vendiendo con una descarga vencida, sincronizar, finalizar y preparar otra.
- Hasta 2000 variantes descargadas y 500 tickets por preparacion. Cada ticket
  admite hasta 50 variantes y 100 unidades por variante, sujetas al stock local.
- Los tickets guardados sobreviven a recargas y reinicios del navegador mediante
  `localStorage`. Web Locks serializa escrituras y sincronizaciones entre pestanas.
  El aislamiento incluye URL de API y usuario. Un cambio de cuenta no borra la cola.
- Una sesion verificada al preparar la descarga permite entrar a la caja offline
  sin consultar el servidor. No permite iniciar una sesion nueva sin internet.
  Si el servidor rechaza un token vencido, iniciar sesion de nuevo con la misma
  cuenta para sincronizar; los tickets permanecen guardados.
- La sincronizacion automatica funciona mientras esta pagina esta abierta.
  No se promete ejecucion con el navegador cerrado.

## Precios, stock y conflictos

El servidor conserva la descarga original. Al sincronizar calcula el importe
con esos precios, independientemente de cambios posteriores del catalogo, y
verifica las cantidades contra lo descargado y lo disponible realmente.
No acepta precios enviados libremente por el navegador.

Otra caja o el canal online pueden consumir stock mientras el dispositivo esta
desconectado. Si aparece **Stock insuficiente**, el ticket permanece guardado:
revisar las existencias reales con el administrador, corregir el inventario si
corresponde y pulsar **Sincronizar ahora**. Nunca se crea stock ficticio, se
elimina el ticket ni se vuelve a cobrar automaticamente. El cierre sigue bloqueado.

La clave UUID se genera una sola vez por ticket. Si el servidor registra una
venta pero se pierde su respuesta, el reintento devuelve esa misma venta. Stock,
pago y acumulados del turno se actualizan juntos en una transaccion. La fecha de
venta conserva la del ticket local; la confirmacion corresponde a la sincronizacion.

La finalizacion verifica que los identificadores locales coinciden con los
registrados en el servidor. Si se pierde la respuesta de finalizacion, se bloquean
nuevos tickets y se ofrece **Reintentar finalizacion**.

**Descargar respaldo** exporta la cola a JSON para su revision. No borrar datos
del sitio, cambiar de direccion ni desinstalar el navegador con tickets pendientes.
El MVP no incluye una pantalla de importacion del respaldo ni cierre offline.

## Verificacion realizada

- Backend: pruebas unitarias y pruebas HTTP con PostgreSQL de precios descargados,
  permisos, dispositivo, idempotencia concurrente, stock insuficiente, rollback,
  fechas y bloqueo de cierre.
- React: persistencia, fallo de almacenamiento, efectivo insuficiente, escrituras
  concurrentes, reintentos, conflictos y bloqueo durante finalizacion incierta.
- Prueba de interfaz: recarga sin conexion, doble clic sin duplicar ticket y
  sincronizacion al reconectar.
- Service worker: precarga de modulos, navegacion offline, recursos estaticos y
  exclusion de peticiones de API y escrituras. Estas son pruebas automatizadas;
  seguir el recorrido anterior en el navegador usado en la presentacion.

## Trabajo restante, por orden recomendado

Checkout con Stripe y contra entrega ya se implementaron en la etapa siguiente;
ver [guia de checkout](checkout-react.md).

1. Reportes tradicionales/dashboard y notificaciones: adaptar React a los
   endpoints reales; actualmente esos servicios conservan contratos de la demo.
2. IA al final: asistente/recomendador y reportes generativos por texto/voz.
3. Prueba general con datos de presentacion, revision responsive y guion de demo.

El portal de proveedor tambien esta conectado: [cuentas, fichas propias y entregas](proveedor-react.md).

La aplicacion movil y el probador RA requieren su propia revision; no fueron
inspeccionados en esta etapa. La carga Cloudinary requiere las credenciales de
la cuenta si aun no se configuraron en el backend.

## Contrato unificado de sincronización (parcial 2)

Desde el parcial 2, la PWA y la app móvil comparten `POST /sync/operations` (módulo
`src/modules/sync`). El flujo por lote de esta guía (`/sales/offline/*`) se conserva
por compatibilidad; las pantallas nuevas usan este contrato. Requiere la
funcionalidad `offline` del plan y roles `ADMINISTRATOR`, `BRANCH_MANAGER`,
`CASHIER` o `CUSTOMER`.

### Descarga para operar offline

`GET /sync/snapshot?branchId=N` devuelve la empresa, la sucursal (el personal solo
la suya), las sucursales activas autorizadas, el turno abierto del usuario, hasta
2000 variantes con precio vigente (`unitPrice`, `discount`, `netUnitPrice`) y
existencia conocida (`available`), y clientes mínimos (id, nombre) solo para el
personal. `generatedAt` permite mostrar la antigüedad de los datos y `version`
cambia cuando cambian productos o existencias de la sucursal.

### Envío de operaciones

```json
{
  "deviceId": "uuid del navegador o teléfono",
  "operations": [
    {
      "operationId": "uuid generado en el dispositivo",
      "type": "SALE_CASH | RESERVATION | EXCHANGE",
      "branchId": 2,
      "createdAtLocal": "2026-10-28T10:15:00-04:00",
      "payload": { "...": "según el tipo" },
      "payloadHash": "opcional: sha256 hex del payload con claves ordenadas"
    }
  ]
}
```

- `SALE_CASH`: `{ shiftId, clientId?, items: [{ productId, sizeId, colorId, quantity, unitPrice }], total, paymentMethod: "CASH", cashReceived? }`.
  `unitPrice` es el precio neto usado en el dispositivo. Se confirma con el mismo
  repositorio del POS (venta, detalle, pago, turno, inventario y kardex en una
  transacción serializable).
- `RESERVATION` (clientes): `{ approximateTime, observation?, items: [{ productId, sizeId, colorId, quantity }] }`.
  Se confirma con `ReservationsService.create`.
- `EXCHANGE` (personal): mismos campos que `POST /exchanges` (`saleId`, `saleItemId` o
  la variante devuelta `returnedProductId/SizeId/ColorId`, `quantity`, `newProductId/SizeId/ColorId`,
  `shiftId?`, `reason?`, `expectedDifference?`). El plazo se evalúa con `createdAtLocal`.
  Conflictos propios: `EXCHANGE_WINDOW_EXPIRED`, `ALREADY_EXCHANGED`, `SALE_NOT_COMPLETED`;
  rechazos: `SALE_NOT_FOUND`, `SHIFT_REQUIRED`.
- Opcionales `tenantId` y `userId` (registro completo de la venta): si vienen, deben coincidir
  con el token (`TENANT_MISMATCH` / `USER_MISMATCH`).
- Máximo 50 operaciones por lote; se procesan en orden y cada una es independiente.

La respuesta trae un resultado por operación:
`{ operationId, status, code, message, detail, resourceType, resourceId, attempts, processedAt }`.

| Estado | Significado | Qué hace el cliente |
|---|---|---|
| `CONFIRMED` | Registrada (`resourceType`/`resourceId` = venta o reserva) | Marcarla confirmada; nunca reenviar otra |
| `CONFLICT` | Los datos locales ya no coinciden con el servidor | Mostrar detalle; reintentar o descartar |
| `REJECTED` | Operación inválida; reenviarla igual no cambia el resultado | Mostrar el motivo |
| `ERROR` | Falla transitoria del servidor (queda pendiente) | Pasar a `RETRY` con espera creciente |

Los estados `LOCAL`, `SENDING` y `RETRY` existen solo en los clientes. Nunca se borra
una operación local por haber intentado enviarla.

Códigos: `STOCK_INSUFFICIENT`, `PRICE_CHANGED`, `PRODUCT_INACTIVE`,
`BRANCH_NOT_AUTHORIZED`, `BRANCH_INACTIVE`, `SHIFT_CLOSED`, `SUBSCRIPTION_INVALID`,
`RESERVATION_TIME_PASSED`, `CONCURRENT_UPDATE` (conflictos) y `INVALID_DATA`,
`TOTAL_MISMATCH`, `SHIFT_NOT_FOUND`, `CLIENT_NOT_FOUND`, `ROLE_NOT_ALLOWED`,
`TENANT_MISMATCH`, `USER_MISMATCH`, `OPERATION_ID_REUSED`, `PAYLOAD_HASH_MISMATCH`,
`UNSUPPORTED_TYPE` (rechazos). `detail` indica, por variante, lo solicitado y lo
disponible o el precio local y el vigente.

### Idempotencia y recuperación

- `operationId` es único por empresa (`operaciones_sync`). Reenviar una operación
  confirmada o rechazada devuelve el resultado guardado sin repetir nada; además la
  venta usa `operationId` como clave de idempotencia y la reserva lo guarda en
  `clave_operacion` (único por empresa).
- Un conflicto se vuelve a evaluar al reenviarlo (p. ej. después de corregir stock o
  renovar la suscripción). El mismo `operationId` con otros datos se rechaza
  (`OPERATION_ID_REUSED`) sin modificar la operación original.
- Con la suscripción vencida o suspendida no hay 403: cada operación vuelve como
  `CONFLICT SUBSCRIPTION_INVALID` y queda para reintentar.
- `GET /sync/operations/:deviceId?ids=a,b` consulta el estado de las operaciones
  propias de un dispositivo.

### Observabilidad

Cada intento queda en `sync_log` (operación, intento, estado, código de error y
latencia), sin payload ni datos personales. `GET /sync/logs?status=&errorCode=`
(administrador; el encargado solo ve su sucursal) devuelve la bitácora paginada y un
resumen por estado y código. Pruebas: `test/sync.e2e-spec.ts` y
`src/modules/sync/sync-outcome.spec.ts`.

## PWA offline (parcial 2)

Capas en `frontend/src/offline/` (RNF07): `db.ts` (IndexedDB con esquema versionado),
`repositorio.ts` (snapshot por sucursal, operaciones y stock local, aislados por
API + empresa + usuario), `cola.ts` (valida contra lo descargado, genera el
`operationId` y guarda **antes** de confirmar al usuario), `sincronizador.ts`
(envío por lotes, estados, reintentos con espera creciente de 5 s a 5 min, bloqueo
entre pestañas) y `migracion.ts`. La UI está en `features/offline/` y
`features/pos/PaginaOffline.tsx`.

| Pantalla | Quién | Qué hace |
|---|---|---|
| `/caja/offline` | cajero, encargado, admin | Descarga la sucursal con el turno abierto, vende en efectivo sin red |
| `/offline` | cliente | Descarga el catálogo de una sucursal, lo consulta sin red y reserva |
| `/pendientes`, `/caja/pendientes` | todos | Estados, detalle de conflictos, reintentar, descartar (no borra) |

El indicador de la cabecera muestra *Sin conexión* y la cantidad de pendientes o
conflictos; la sincronización es automática al recuperar la conexión y cada 30 s
mientras haya pendientes, y manual desde *Pendientes*. Los datos muestran su
antigüedad y se marcan como posiblemente desactualizados después de 12 horas. Con
una sesión verificada al descargar, la app abre sin red hasta 3 días en las
pantallas offline.

**Migración (F5.1):** al abrir la app, los tickets del lote del parcial 1 guardados
en `localStorage` pasan a IndexedDB con su mismo identificador; la copia antigua
queda como respaldo (`…:migrado`). Se envían con `offlineBatchId`, así el servidor
respeta los precios de esa descarga; cuando todos quedan confirmados, el lote se
finaliza solo y se libera la caja normal.

**Recorrido de demostración:** compilar (`npm run build` y
`npm run preview -- --port 5173 --strictPort`), abrir turno, `/caja/offline` →
*Descargar datos de mi sucursal* → desconectar → recargar → vender → cerrar el
navegador → abrirlo sin red en `/caja/pendientes` (la venta sigue *Guardada
localmente*) → conectar → pasa a *Confirmada* con su número de venta. Verificado con
Playwright sobre la build de producción (perfil persistente). Pruebas automáticas:
`frontend/test/offline-sync.test.ts` y `frontend/test/offline-ui.test.tsx`.
