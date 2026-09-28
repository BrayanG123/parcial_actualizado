# Ventas offline y PWA para la presentacion

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
