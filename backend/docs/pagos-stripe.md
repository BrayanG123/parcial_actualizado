# Pagos con Stripe

El backend usa Payment Intents para pagos con tarjeta en web y móvil. El importe
proviene de la venta creada por checkout; el cliente envía solamente `saleId`.
Una confirmación verificada completa la venta y descuenta el inventario una sola
vez. Esta integración académica acepta únicamente claves y eventos de **prueba**.

## Configuración

Las tres variables se leen de `backend/.env`:

```dotenv
STRIPE_SECRET_KEY=sk_test_tu_clave
STRIPE_WEBHOOK_SECRET=whsec_tu_secreto
STRIPE_PUBLISHABLE_KEY=pk_test_tu_clave_publica
SALES_CURRENCY=BOB
CHECKOUT_HOLD_MINUTES=15
```

Configurar las tres juntas. Si ninguna está configurada, los demás módulos siguen
funcionando y las operaciones Stripe responden 503. La validación no imprime los
valores secretos. Las claves `sk_live_`/`pk_live_` se rechazan deliberadamente para
cumplir el entorno de prueba del examen.

Se conservó la conexión existente a **`tienda_ropa`**. Aplicar desde `backend`:

```powershell
npm run prisma:migrate:deploy
npm run start:dev
```

La migración `20260913000000_stripe_payments` agrega al pago los identificadores
de Stripe, una clave interna estable, estado de sincronización y seguimiento del
reembolso. Agrega `REFUNDED` a `PaymentStatus`. No agrega nuevas entidades al modelo.
Las migraciones se probaron en otra instancia; no se aplicaron a `tienda_ropa`.

## Webhook local

Con Stripe CLI instalado y autenticado, en otra terminal:

```powershell
stripe listen --forward-to http://localhost:3000/api/v1/payments/stripe/webhook
```

Usar como `STRIPE_WEBHOOK_SECRET` el `whsec_...` que muestra **ese listener** y
reiniciar el backend. El secreto de un endpoint del Dashboard y el del listener
local pueden ser distintos. La API conserva el cuerpo original mediante
`rawBody: true` y comprueba `Stripe-Signature`, incluida su antigüedad.
[Documentación de webhooks de Stripe](https://docs.stripe.com/webhooks).

Para un backend publicado, registrar su URL HTTPS en Stripe en modo prueba y
suscribirse a:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `payment_intent.processing`
- `payment_intent.requires_action`
- `refund.created`, `refund.updated`, `refund.failed`

Los eventos desconocidos o de pagos ajenos a esta aplicación se ignoran con 200.
Los errores temporales responden con error para permitir reintentos del proveedor.
Una firma inválida responde 400. No se registra el cuerpo completo del evento.

`stripe trigger payment_intent.succeeded` crea normalmente un pago sin relación
con este proyecto y será ignorado. Para probar una venta hay que crear su intento
mediante el endpoint indicado a continuación y confirmarlo con Stripe.

## Rutas

Prefijo `/api/v1`. Se utiliza la respuesta común `{ success, data, timestamp }`.
Contrato importable: [payments.openapi.json](./payments.openapi.json).

| Método | Ruta | Acceso y finalidad |
|---|---|---|
| GET | `/payments/stripe/config` | JWT cliente; clave pública y monedas admitidas |
| POST | `/payments/stripe/intents` | JWT cliente propietario; crear/reutilizar intento |
| GET | `/payments/sales/:saleId` | Propietario o personal autorizado; estado local |
| POST | `/payments/stripe/webhook` | Sin JWT; firma Stripe obligatoria |

Las respuestas autenticadas de Pagos llevan `Cache-Control: no-store`.
La consulta de estado también permite pagos presenciales y respeta los permisos
por sucursal del módulo Ventas. No devuelve `clientSecret` ni la clave interna.

## Flujo web/móvil

1. Crear carrito, cotizar y ejecutar `/sales/checkout` según la
   [guía de Ventas](./ventas-checkout.md). Conservar el `id` de la venta pendiente.
2. Con el JWT de su propietario, llamar a `POST /payments/stripe/intents`:

   ```json
   { "saleId": 123 }
   ```

3. La respuesta incluye `paymentIntentId`, `clientSecret`, `publishableKey`,
   `amount` en unidades monetarias, `currency`, estados y `expiresAt`.
4. En web, usar Stripe.js con Payment Element y `stripe.confirmPayment`; en móvil,
   usar el SDK de Stripe y PaymentSheet con ese `clientSecret`. Los datos de la
   tarjeta se recogen directamente con Stripe, sin enviarlos a este backend.
5. Consultar `/payments/sales/123` para mostrar el resultado final. La redirección
   del navegador no confirma una venta: la confirma el webhook o la revisión
   automática del estado del proveedor.

Si la creación recupera un pago ya finalizado, `clientSecret` puede ser `null`;
mostrar el estado y no volver a abrir el formulario de pago. Reintentar el mismo
`saleId` reutiliza el mismo Payment Intent. Una tarjeta rechazada puede reintentarse
con otra tarjeta en ese intento mientras el checkout siga vigente.

El frontend aún debe incorporar esos componentes. No se implementó una página
alojada de Stripe Checkout ni suscripciones. La clave publicable puede usarse en
el cliente; las otras dos permanecen exclusivamente en el servidor. No guardar
el `clientSecret` en logs, URLs ni almacenamiento compartido.
[Flujo de Payment Intents](https://docs.stripe.com/payments/payment-intents).

## Importes y estados

La integración admite `BOB`, `USD` y `EUR`, todos tratados con dos decimales. Usa
Decimal para convertir el importe al entero de unidades menores que exige Stripe
y limita ese entero a 99.999.999. No cambia automáticamente la moneda de una venta.
Stripe valida además disponibilidad y mínimo de cobro según la cuenta; si rechaza
el importe/moneda, no se confirma la venta.
[Monedas e importes de Stripe](https://docs.stripe.com/currencies).

Se comprueban moneda, importe solicitado, importe recibido, modo de prueba,
identificador del intento y metadatos del pago/venta antes de consumir stock.

| Situación | Venta | Pago local | Inventario |
|---|---|---|---|
| Intento creado, autenticación o tarjeta rechazada | `PENDING_PAYMENT` | `PENDING` | Retenido hasta vencimiento |
| Pago confirmado dentro del plazo | `COMPLETED` | `APPROVED` | Descuento físico y liberación de retención |
| Pedido/intento cancelado o vencido sin cobrar | `CANCELLED` | `VOIDED` | Retención liberada |
| Cobro de pedido cancelado/vencido; reembolso pendiente | `CANCELLED` | `VOIDED` + `stripeRefundStatus` | Permanece liberado |
| Reembolso confirmado por Stripe | `CANCELLED` | `REFUNDED` | Sin nuevo movimiento |

`stripeStatus` conserva el estado del Payment Intent y `stripeRefundStatus` el
del reembolso. El campo heredado `paidAt` existe desde que se crea el registro;
solo representa confirmación de cobro cuando el estado es `APPROVED`. Para la
confirmación de la venta usar también `confirmedAt`.

## Reintentos y recuperación

La clave de creación se genera y persiste en el pago antes de llamar a Stripe;
es única incluso entre bases de datos independientes. Se envía como clave de
idempotencia. El intento se vincula al pago antes de devolver su secreto al cliente.
Una caída después de crear el intento puede recuperarse repitiendo la solicitud
dentro del plazo del checkout. No se crean intentos nuevos para pedidos vencidos.
[Idempotencia en Stripe](https://docs.stripe.com/api/idempotent_requests).

Los efectos locales son idempotentes; cada entrega consulta el estado actual de
Stripe, por lo que una notificación antigua de rechazo no revierte un pago aprobado.
No se guarda el contenido completo de webhooks. La revisión automática corre al
iniciar y cada minuto, evita solaparse en la misma instancia y procesa lotes de
100 pagos. Recupera confirmaciones perdidas y cancela intentos de pedidos cancelados.
No se mantienen transacciones PostgreSQL abiertas durante llamadas a Stripe.

Un pago confirmado después del plazo no recupera stock: solicita un reembolso
total al medio de origen. La solicitud queda persistida antes de contactar Stripe;
si hay una interrupción, el proceso automático la reintenta. Busca reembolsos
existentes y reutiliza su clave para evitar duplicarlos. `pending` no se considera
reembolso completado; se vuelve a consultar hasta recibir el resultado.
[API de reembolsos](https://docs.stripe.com/api/refunds).

Los reembolsos `failed`, `canceled` o `requires_action` quedan visibles en el pago
y generan un aviso con el ID local para revisión en Stripe. No se crean intentos
de reembolso nuevos automáticamente cuando el proveedor declaró un fallo terminal.

El alcance del reembolso automático son los cobros de pedidos cancelados/vencidos.
Las devoluciones comerciales de ventas completadas, reembolsos parciales, disputas
y reembolsos manuales desde el Dashboard requieren otro flujo con sus reglas de
inventario; no se gestionan mediante este módulo.

## Pruebas

```powershell
npm test -- --no-file-parallelism
npm run lint
npm run build
$env:TEST_DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/base_de_pruebas'
npm run test:e2e -- --no-file-parallelism
```

Los E2E crean/eliminan esquemas aleatorios, usan PostgreSQL real y verifican firmas
Stripe reales generadas con un secreto de prueba local. Simulan la API externa
para cubrir rechazos, errores, concurrencia, vencimiento y reembolsos de forma
repetible. No usan tus claves para hacer cargos durante la suite habitual.

Existe además una comprobación explícita contra la API real de Stripe en modo
prueba, con sus claves en `.env` y `TEST_DATABASE_URL` configurado:

```powershell
$env:RUN_STRIPE_SMOKE = 'true'
npm run test:stripe:smoke
```

Crea dos pagos con `pm_card_visa`: uno normal y otro vencido. Verifica idempotencia,
confirmación, reembolso e inventario. Elimina el esquema temporal y reembolsa los
cargos de prueba restantes. Los objetos de prueba quedan visibles en Stripe.
No ejecutar contra credenciales de producción. No se incorporan cobros Stripe al
seed general; esta comprobación es una operación explícita separada.
