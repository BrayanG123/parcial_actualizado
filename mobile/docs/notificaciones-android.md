# Push de clientes en Android

La app usa `expo-notifications` y token FCM nativo (`getDevicePushTokenAsync`).
NestJS envía con `firebase-admin`; no interviene Expo Push Service ni se usa VAPID.

## Eventos

| Cambio confirmado | Aviso | Destino |
|---|---|---|
| Reserva READY | Reserva lista | DetalleReserva |
| Reserva CANCELLED | Reserva cancelada | DetalleReserva |
| Reserva EXPIRED | Reserva vencida | DetalleReserva |
| Checkout contra entrega nuevo | Pedido registrado | DetalleCompra |
| Stripe confirma pago | Pago confirmado | DetalleCompra |
| Personal confirma entrega/cobro | Entrega confirmada | DetalleCompra |

Solo se seleccionan tokens ANDROID del propietario activo con rol CUSTOMER.
El envío ocurre después del commit y solo ante cambios efectivos. Repetir checkout,
entrega, webhook o estado no vuelve a disparar el evento. El indicador de creación
pertenece al resultado de la transacción, incluso cuando hay reintentos concurrentes.

## Configuración local realizada el 24/09/2026

- App Firebase Android registrada: `bo.fashionstore.movil`, proyecto `shoping-a72ce`.
- Configuración cliente descargada en `mobile/google-services.json`.
- Variables FIREBASE del `backend/.env` local completadas con la cuenta de servicio.
- Ambos archivos están excluidos de Git. `.easignore` incluye solo el JSON cliente.
- Pendientes: despliegue de API en Azure, compilación APK y prueba en teléfono.

La cuenta de servicio contiene una clave privada del servidor: **no es**
`google-services.json` y nunca debe incluirse en la app.

## Preparar otro entorno

1. Firebase > Configuración del proyecto > General > Tus apps > Android:
   registrar/seleccionar `bo.fashionstore.movil` y descargar `google-services.json`.
2. Colocarlo en `mobile/` o usar `GOOGLE_SERVICES_JSON` como variable de archivo
   EAS (valor: ruta). `app.config.js` valida el paquete y falla en un build
   Android EAS sin el archivo.
3. Backend: configurar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y
   `FIREBASE_PRIVATE_KEY` del mismo proyecto. La cuenta necesita permisos FCM
   y Firebase Cloud Messaging API habilitada. Nunca usar EXPO_PUBLIC_* para secretos.
4. Desplegar/reiniciar la API. Con JWT cliente, `GET /api/v1/push/status`
   devuelve `data.enabled=true` si tiene configuración; no verifica entrega real.

## Compilar e instalar

Desde `mobile/`, con Node 24 y acceso al proyecto Expo:

```powershell
npm ci
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Preview produce APK. `EXPO_PUBLIC_API_URL` en `eas.json` apunta a Azure:
actualizar allí la API antes de probar. EAS necesita acceso a la cuenta y firma.
Se agregó un módulo nativo: hace falta una nueva APK; actualizar solo JS no basta.

Instalar, iniciar sesión de cliente y abrir **Perfil > Notificaciones > Activar avisos**.
Primero se crea el canal `customer-updates`, luego se solicita permiso.
Si el permiso está bloqueado, el botón abre los ajustes de Android.

Expo Go Android no admite este push remoto. Web, iOS y mocks no inicializan
la integración. Exportar Metro comprueba el bundle JS, no genera una APK.

## Sesión y navegación

- POST /push/tokens: `{ token, platform: "ANDROID" }`; DELETE: `{ token }`.
  El destinatario se obtiene del JWT, nunca del body.
- Se registra con permiso concedido al restaurar sesión, reanudar y renovar token.
- Una cola serializa altas/bajas usando el JWT capturado; evita registrar
  respuestas tardías en otra cuenta.
- Logout retira el token antes de borrar sesión y limpia avisos visibles.
  Si falla la red, cierra sesión y avisa que debe desactivar notificaciones
  desde Android hasta reconectar; un mensaje en tránsito todavía puede llegar.
- El payload incluye tipo, ID, userId, event y eventId. Solo se aceptan destinos
  conocidos; se espera a restaurar sesión y navegación. Otra cuenta no abre
  el detalle. La API conserva la comprobación final de propiedad.
- En primer plano se invalidan consultas de compras/reservas. Textos genéricos,
  sin nombre, dirección ni importe.

## Límites y validación

Envío de mejor esfuerzo: sin outbox ni reintento persistente. Una caída después
del commit puede perder el aviso; los fallos no revierten ventas ni stock.
No se garantiza entrega exactamente una vez. Etiquetas estables agrupan eventos;
se deduplican respuestas de navegación. Se eliminan tokens no registrados,
no los que fallan por errores de payload. Se suprime READY si la reserva ya cambió.

```powershell
npm run typecheck
npm run test:push
npm run lint
npx expo export --platform android --output-dir dist/push-android
```

Resultado: 44 pruebas unitarias backend y 7 móviles aprobadas; compilación backend,
tipos y export Android aprobados. Lint móvil conserva avisos anteriores.
Dos pruebas HTTP push omitidas por falta de TEST_DATABASE_URL; no acreditan integración.

Prueba pendiente en teléfono: permisos aceptados/rechazados; los seis eventos;
repetir confirmaciones; app abierta, segundo plano y arranque desde aviso;
logout/cambio de cuenta y reconexión. Forzar detención desde ajustes puede impedir
recepción hasta volver a abrir. No se enviaron push reales en esta tarea.

Referencias: [Expo Notifications 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/),
[FCM directo](https://docs.expo.dev/push-notifications/sending-notifications-custom/),
[configuración Android](https://docs.expo.dev/push-notifications/fcm-credentials/).
