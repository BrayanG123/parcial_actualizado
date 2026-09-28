# Checkout de React: Stripe y contra entrega

## Alcance para la presentacion

- Cliente: carrito → checkout → elegir sucursal con stock suficiente → revisar total del servidor → crear pedido.
- **Stripe, solo modo prueba:** tarjeta mediante Payment Element oficial; retiro en la sucursal seleccionada. El backend confirma la venta tras verificar Stripe, descuenta existencias y habilita el comprobante. Los pagos web no ingresan al efectivo de un turno.
- **Contra entrega:** destinatario, telefono y direccion; envio gratuito para la demo, dentro de la ciudad de la sucursal, coordinado por telefono. Se apartan las prendas, sin registrar dinero ni aplicar el vencimiento de 15 minutos de Stripe. Se cobra en efectivo al entregar. No hay integracion con empresas de transporte ni seguimiento del repartidor.
- En **Mis compras → Ver detalle** se puede retomar Stripe, consultar el estado o cancelar un pedido pendiente. Cancelar libera stock; un carrito convertido no se reconstruye automaticamente.
- En **Ventas → Ver**, administrador, encargado o cajero de la sucursal puede registrar entrega y cobro. Necesita su propio turno abierto en esa sucursal y haber finalizado el modo offline. La confirmacion significa que la entrega ya ocurrio y el efectivo recaudado ingresa a esa caja. Descuenta stock, aprueba el pago y suma el importe al arqueo en una transaccion.
- Las operaciones de checkout y entrega requieren conexion. El POS offline conserva su alcance anterior.

## Preparacion

La migracion `20260918000000_cash_on_delivery` ya se aplico en la base local. Para otro entorno, ejecutar en backend:

```powershell
npm run prisma:migrate:deploy
npm run build
npm run start:dev
```

En frontend:

```powershell
npm install
npm run dev
```

Usar `VITE_USE_MOCKS=false` y la URL del backend segun `.env.example`. Stripe se configura exclusivamente en `backend/.env`: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Las tres ya existian en el entorno local; no se copiaron a React. La clave publicable se obtiene del endpoint autenticado de configuracion. Solo se aceptan claves test. `SALES_CURRENCY` admite BOB, USD o EUR para Stripe; el cliente utiliza la moneda y los importes del pedido.

Reiniciar Nest si estaba abierto antes de aplicar la migracion. Para demostrar tambien PWA/offline seguir [ventas-offline.md](ventas-offline.md) y reconstruir frontend. Si hay una PWA anterior abierta, cerrar sus pestanas y volver a abrir para activar la version nueva.

## Stripe en localhost

Con Stripe CLI instalado y autenticado en la misma cuenta de prueba:

```powershell
stripe listen --forward-to http://localhost:3000/api/v1/payments/stripe/webhook
```

Guardar el `whsec_...` de ese listener en `STRIPE_WEBHOOK_SECRET` y reiniciar backend si cambio. Mantener el listener abierto durante la demostracion. El backend tambien concilia al arrancar y cada minuto; si no llega el webhook, la confirmacion puede tardar hasta ese intervalo. El boton **Consultar estado del pago** recupera el intento y verifica su estado con Stripe, sin crear un nuevo cobro. **Actualizar estado** consulta lo ya confirmado en la base.

El frontend limpia de la URL los parametros de retorno de Stripe. No guarda numeros de tarjeta ni client secrets en almacenamiento local. Un retorno o mensaje de exito del navegador nunca aprueba la venta. La integracion usa PaymentIntents existentes, no Checkout Sessions.

Referencias oficiales: [React Stripe.js y Payment Element](https://docs.stripe.com/sdks/stripejs-react?ui=elements), [webhooks locales](https://docs.stripe.com/webhooks?lang=node).

## Guion de prueba

1. Entrar como cliente, agregar prendas y continuar desde el carrito. Elegir sucursal y revisar total.
2. Elegir Stripe, crear el pedido y pulsar **Abrir pago con Stripe** en el detalle. Usar tarjeta `4242 4242 4242 4242`, una fecha futura y CVC de tres digitos. Esperar confirmacion del backend y mostrar el comprobante. Para rechazo, usar `4000 0000 0000 9995`. [Tarjetas oficiales de prueba](https://docs.stripe.com/testing).
3. Crear otro pedido contra entrega con nombre, telefono y direccion. Mostrar que sigue pendiente y las unidades estan apartadas.
4. Entrar como cajero de esa sucursal, abrir turno en Caja, ir a Historial de ventas, abrir el pedido y confirmar **Registrar entrega y cobro**. Mostrar comprobante, stock descontado y efectivo aumentado en el turno.
5. Crear y cancelar otro pedido pendiente: comprobar liberacion de stock y ausencia de cobro. No existe cancelacion de ventas ya pagadas; no se implemento una gestion general de devoluciones.

## Contratos y protecciones

- `POST /sales/checkout/preview`: `{cartId, branchId}` → precios actuales, variantes, total, moneda y `quoteHash`.
- `POST /sales/checkout`: conserva `cartId`, `branchId`, `channel`, UUID `idempotencyKey` y `quoteHash`. Agrega `paymentOption: STRIPE | CASH_ON_DELIVERY`; omitirlo conserva Stripe por compatibilidad. Contra entrega exige `deliveryName`, `deliveryPhone`, `deliveryAddress`.
- `POST /payments/stripe/intents`: `{saleId}`; reutiliza el intento. No acepta importes del cliente ni funciona sobre pedidos contra entrega.
- `POST /sales/:id/deliver`: `{shiftId, expectedTotal}`. Solo personal autorizado; valida importe, sucursal, turno propio abierto y pago pendiente. Repetir la misma entrega devuelve el resultado original sin volver a descontar ni cobrar, incluso despues de cerrar ese turno.
- `PATCH /sales/:id/cancel`: propietario o personal autorizado; solo pedidos digitales pendientes.
- React guarda la solicitud de creacion en sessionStorage por API y usuario **antes de enviarla**. Ante respuesta incierta conserva exactamente UUID y datos; al recargar ofrece reintento. Si se borra ese almacenamiento, consultar Mis compras; el backend conserva la unicidad del carrito convertido.
- La migracion agrega datos de entrega y permite apartados sin vencimiento solo para contra entrega. No altera los pedidos previos.

## Verificacion realizada

Pruebas HTTP con PostgreSQL aislado: creacion y datos obligatorios, permisos, stock, cancelacion, turno cerrado/offline, doble entrega simultanea y carrera entrega/cancelacion. Suite de pagos: webhooks firmados, idempotencia y reembolsos tardios. Prueba adicional contra la API real de Stripe **en modo prueba**, usando `pm_card_visa`, con pago normal y pago tardio reembolsado; los objetos de prueba se cancelan/reembolsan al finalizar.

Pruebas React: total del servidor, recuperacion del mismo pedido tras perder respuesta, aislamiento por cuenta, contra entrega sin Stripe, retomar pago, confirmacion de efectivo, envio mediante Elements, rechazo y doble clic. Los componentes externos de Stripe se simulan en las pruebas de DOM; la prueba real de Stripe valida API/backend, no reemplaza el ensayo visual del formulario en navegador.
