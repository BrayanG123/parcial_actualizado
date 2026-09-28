# Guia de pruebas manuales de FashionStore

Esta guia sirve para comprobar el sistema completo con la API real, PostgreSQL y
la web real. El orden importa: primero se ejecuta la ruta critica de negocio y
despues los modulos complementarios.

La finalidad no es forzar que toda accion sea exitosa. Una validacion, un 401,
un 403 o un mensaje de stock insuficiente es correcto cuando se provoca a
proposito. Lo que no debe ocurrir es un error 500, una pantalla bloqueada, datos
duplicados o cantidades de inventario incoherentes.

## 1. Preparacion

Usar una base de datos de prueba nueva. El seed masivo es idempotente y no
restaura cambios hechos durante las pruebas; para repetir un ensayo limpio se
debe crear otra base y volver a aplicar migraciones.

Desde `backend`:

```powershell
npm run prisma:migrate:deploy
npm run prisma:seed:massive
npm run start:dev
```

Desde `frontend`, comprobar que `.env` tiene `VITE_USE_MOCKS=false` y una URL
que apunte a la API local, por ejemplo `VITE_API_URL=http://localhost:3000/api/v1`.
Luego iniciar la web:

```powershell
npm run dev
```

Abrir la URL que muestra Vite y confirmar, desde el catalogo, que se ven productos
`MASIVO - ...`. Antes de empezar, abrir las herramientas de desarrollo del
navegador en la pestana **Network**: una operacion correcta debe devolver 2xx y
no debe aparecer ningun 5xx.

### Cuentas para el ensayo

Todas las cuentas del seed masivo usan la contrasena `Password123`.

| Cuenta                                 | Uso recomendado                           |
| -------------------------------------- | ----------------------------------------- |
| `cliente002@masivo.fashionstore.test`  | Compra y reserva de prueba                |
| `cajero01@masivo.fashionstore.test`    | Caja de La Paz                            |
| `encargado01@masivo.fashionstore.test` | Operaciones de La Paz                     |
| `proveedor01@masivo.fashionstore.test` | Portal de proveedor                       |
| `admin@masivo.fashionstore.test`       | Catalogo, inventario, usuarios y reportes |

Para que la prueba sea facil de seguir, usar la prenda `MASIVO - Camisa Urbana
001`, talla `XS`, color `Negro` y la sucursal `MASIVO - Sucursal Sopocachi`.
Esa variante corresponde a La Paz, donde operan `cajero01` y `encargado01`.

### Registro de evidencia

Completar una fila por caso importante. Una captura de pantalla del comprobante,
del movimiento y del reporte final es evidencia suficiente para una presentacion.

| Caso  | Cuenta     | Resultado esperado                | Evidencia          | Resultado real |
| ----- | ---------- | --------------------------------- | ------------------ | -------------- |
| RC-01 | cliente002 | Pedido contra entrega creado      | ID del pedido      |                |
| RC-02 | cajero01   | Entrega y cobro registrados       | Comprobante        |                |
| RC-03 | admin      | Venta y caja aparecen en reportes | Captura de reporte |                |

## 2. Ruta critica: compra hasta cobro y reporte

No continuar al siguiente paso si el resultado esperado no ocurre. Anotar el ID
del pedido creado, porque se usara en los pasos de caja y reporte.

### RC-01: catalogo, sesion y carrito

1. Sin iniciar sesion, entrar a **Catalogo** y abrir `MASIVO - Camisa Urbana 001`.
2. Confirmar que se muestran foto, precio, talla `XS`, color `Negro` y
   disponibilidad de `MASIVO - Sucursal Sopocachi`.
3. Iniciar sesion como `cliente002@masivo.fashionstore.test`.
4. Volver a la prenda, elegir `XS` y `Negro`, agregar una unidad al carrito y
   abrir **Carrito**.

Resultado esperado:

- El carrito contiene una sola linea, con precio y subtotal calculados por el
  servidor.
- No se descuenta todavia el inventario; agregar al carrito no reserva unidades.
- La web no muestra errores de permisos ni de red.

### RC-02: checkout contra entrega

1. En el carrito seleccionar **Finalizar compra**.
2. Elegir `MASIVO - Sucursal Sopocachi`.
3. Elegir **Efectivo contra entrega**.
4. Escribir datos de prueba, por ejemplo: destinatario `Cliente Prueba`, telefono
   `+591 70000001` y direccion `Calle Prueba 123, La Paz`.
5. Pulsar **Confirmar pedido contra entrega**.
6. En la pantalla de detalle, anotar el ID y comprobar que aparece
   **Pendiente de entrega y cobro**.

Resultado esperado:

- Se crea un pedido `PENDING_PAYMENT` con una unidad apartada.
- El carrito queda convertido o vacio y el pedido aparece en **Mis compras**.
- La ficha del pedido conserva destinatario, telefono, direccion, sucursal y total
  en BOB.

### RC-03: apertura de turno y entrega

1. Cerrar sesion e iniciar como `cajero01@masivo.fashionstore.test`.
2. Entrar en **Punto de venta** y abrir un turno en `Caja 1` de la sucursal La Paz.
   Usar un saldo inicial sencillo, por ejemplo `100` BOB.
3. Entrar en **Historial de ventas**, localizar el pedido creado y pulsar **Ver**.
4. Confirmar que el detalle muestra los datos de contra entrega.
5. Pulsar **Registrar entrega y cobro** y despues **Confirmar efectivo recibido**.

Resultado esperado:

- El boton de entrega solo se habilita con un turno propio, abierto y de la misma
  sucursal. Sin turno debe verse una explicacion, no un cobro permitido.
- El pedido cambia a completado, registra fecha de entrega y crea el pago en
  efectivo.
- La unidad deja de estar reservada y se descuenta de la existencia fisica.
- El total de efectivo y la cantidad de ventas del turno aumentan una vez.

### RC-04: cierre y reporte

1. Volver a **Punto de venta** o **Turnos y arqueos**.
2. Cerrar el turno con efectivo contado igual a `100 + total del pedido`.
3. Iniciar sesion como administrador y abrir **Ventas**. Buscar por fecha de hoy
   y verificar el pedido.
4. Abrir **Reportes**, seleccionar la fecha de hoy y comprobar ventas, canal y
   total. Revisar tambien el bloque de cajas y turnos.
5. Abrir **Inventario**, localizar la variante y revisar su historial de
   movimientos.

Resultado esperado:

- El cierre no muestra diferencia cuando el contado es correcto.
- La venta nueva aparece una sola vez en historial, reporte de ventas y reporte de
  caja.
- Inventario contiene el movimiento de retencion del pedido y el de venta o cobro
  final, con cantidades coherentes.

Si RC-01 a RC-04 funciona, quedaron comprobados los recorridos esenciales de
autenticacion, catalogo, carrito, checkout, control de stock, ventas, pagos,
caja, historial y reportes.

## 3. Pruebas funcionales complementarias

Ejecutar las secciones en este orden. Se puede usar un cliente distinto por
seccion para conservar evidencias separadas.

### 3.1 Autenticacion, perfil y permisos

- Registrar una cuenta nueva desde **Crear cuenta**, iniciar sesion y completar
  telefono y direccion en **Mi perfil**.
- Cerrar sesion, comprobar que **Mis compras**, **Carrito** y las rutas internas
  ya no son accesibles como cliente.
- Como cliente, intentar abrir manualmente `/admin`, `/caja` y `/proveedor`.
  Debe redirigir o negar acceso; nunca mostrar datos internos.
- Como `encargado01`, comprobar que Inventario, Reservas, Ventas y Reportes solo
  muestran su sucursal. Como administrador, comprobar que se pueden elegir todas.
- Como proveedor, comprobar que solo aparecen las rutas de **Mis productos** y
  **Entregas programadas**.

### 3.2 Catalogo y administracion

Con `admin@masivo.fashionstore.test`:

1. Crear una categoria, talla, color, temporada, coleccion y proveedor de prueba.
2. Crear un producto con dos tallas, dos colores, precio minorista y, si se desea,
   precio mayorista menor o igual al minorista.
3. Editar el producto: cambiar descripcion, fotos, promocion y estado activo.
4. Desactivarlo y confirmar que deja de estar disponible al publico, pero se
   conserva en administracion e historiales.
5. Intentar guardar un producto sin proveedor, coleccion, talla o color. La
   validacion debe informar el campo faltante y no crear datos parciales.

Resultado esperado: catalogo publico solo muestra productos activos; las fechas de
promocion y el precio actual se calculan en servidor; no se permiten precios
mayoristas mayores que el precio normal.

### 3.3 Inventario y movimientos

Con administrador o encargado de la sucursal:

1. En **Inventario**, elegir una variante existente y anotar existencia fisica,
   reservada y disponible.
2. Registrar una entrada inmediata de 5 unidades. Confirmar que aumenta stock y
   aparece movimiento `ENTRY`.
3. Registrar una entrada programada para una fecha futura. Confirmar que aparece
   como pendiente sin aumentar stock.
4. Abrir **Movimientos**, recibir la entrada pendiente y comprobar que entonces
   aumenta el inventario.
5. Crear un ajuste que deje stock en cero y despues registrar una devolucion de
   una unidad, con observacion.
6. Intentar ajustar por debajo de la cantidad reservada. Debe rechazarse sin
   modificar cantidades.

### 3.4 Reservas y notificaciones

1. Iniciar sesion con `cliente002`, abrir **Reservar en tienda** y reservar una
   unidad de la prenda de La Paz para una fecha futura.
2. Confirmar que aparece en **Mis reservas** y que la cantidad reservada de la
   variante aumenta.
3. Iniciar sesion como `encargado01`. Esperar hasta 30 segundos o refrescar la
   campana. Abrir la notificacion y verificar que dirige a la reserva correcta.
4. En **Reservas**, cambiar el estado en secuencia:
   `PENDING -> PREPARING -> READY -> CUSTOMER_PRESENT -> COMPLETED`.
5. Crear otra reserva y cancelarla desde el cliente antes de `CUSTOMER_PRESENT`.

Resultado esperado: cada reserva creada genera un aviso para su sucursal; el
encargado no puede gestionar una reserva de otra sucursal; al cancelar o cerrar
la atencion se liberan unidades pendientes que no fueron compradas.

### 3.5 Punto de venta y turnos

1. Como `cajero01`, abrir un turno nuevo despues de cerrar el anterior.
2. En **Punto de venta**, agregar una variante disponible, elegir cliente o
   consumidor final, revisar cotizacion y registrar una venta en efectivo.
3. Repetir con tarjeta, QR o transferencia y comprobar que cada medio incrementa
   el acumulado correcto del turno.
4. Intentar vender mas unidades que las disponibles. Debe rechazarse y no crear
   venta ni pago.
5. Cerrar el turno con el efectivo contado correcto. Para probar control de
   diferencias, abrir otro turno y cerrar con un monto distinto: el sistema debe
   pedir observacion.

### 3.6 Pedidos digitales y Stripe opcional

La ruta critica ya valida contra entrega. Para Stripe se requieren las tres
variables `STRIPE_*` configuradas con claves de prueba.

1. Como cliente, crear un pedido seleccionando **Tarjeta con Stripe**.
2. Abrir el detalle y completar el formulario seguro de Stripe con una tarjeta de
   prueba autorizada por Stripe.
3. Verificar que la compra pasa a completada una sola vez y que el carrito queda
   convertido.
4. Crear otro pedido digital y cancelarlo antes del pago. Confirmar que libera
   stock y no deja el pedido como pendiente.

Si Stripe no esta configurado, el mensaje de indisponibilidad y la alternativa de
contra entrega son el resultado esperado. No registrar tarjetas reales.

### 3.7 Portal de proveedor

1. Iniciar sesion como `proveedor01@masivo.fashionstore.test`.
2. En **Mis productos**, buscar una prenda propia, editar nombre, descripcion y
   disponibilidad para suministrar. Guardar y refrescar.
3. Como administrador, abrir esa prenda y comprobar que la disponibilidad se ve
   internamente, sin exponerla en el catalogo publico.
4. Como administrador, registrar una entrada programada para un producto de ese
   proveedor. Como proveedor, verificar que aparece en **Entregas programadas**.
5. Recibir la entrada desde Inventario y comprobar que el proveedor la ve como
   recibida.

Resultado esperado: el proveedor no puede cambiar precio, stock, proveedor
asignado, publicacion ni variantes; esas acciones corresponden a administracion.

### 3.8 Reportes, IA y recomendaciones

1. Como administrador, consultar **Reportes** para un intervalo que incluya los
   ultimos 90 dias. Revisar totales por dia, sucursal, canal, productos, stock y
   reservas.
2. Verificar que las 320 ventas `COMPLETED` del seed masivo aparecen en los
   ingresos; pedidos pendientes y cancelados no deben sumarse como ventas
   completadas.
3. Como encargado, repetir y confirmar que solo ve datos de su sucursal.
4. En **Reportes con IA**, probar una pregunta como `Ventas web de la ultima
semana` y una consulta de inventario o caja.
5. En el asistente de la tienda, probar una consulta de recomendaciones desde una
   sesion de cliente.

Con Gemini u Ollama configurado, la respuesta debe indicar el proveedor. Sin un
modelo disponible, el sistema debe responder con reglas o informar que no esta
configurado; no debe fallar la pantalla ni exponer claves.

### 3.9 Ventas offline y PWA

Probar este caso en una compilacion servida o desplegada, no solo en modo de
desarrollo, porque requiere service worker.

1. Como cajero con turno abierto, entrar a **Ventas offline** y preparar la
   descarga del catalogo.
2. Desconectar temporalmente la red, crear un ticket en efectivo y comprobar que
   queda en cola local con su UUID.
3. Reconectar, pulsar sincronizar y comprobar que se crea una sola venta, un pago
   y un movimiento de inventario.
4. Intentar cerrar el turno con tickets pendientes: debe bloquearse.
5. Usar **Descargar respaldo** y guardar el JSON como evidencia.

No borrar datos del sitio ni cambiar de cuenta mientras existan tickets offline.

### 3.10 Recursos RA y version movil

- Como administrador, registrar un recurso RA valido para un producto desde su
  formulario y comprobar que permanece asociado tras recargar.
- En el movil, con la URL de API de la red local configurada, probar login,
  catalogo, carrito, reserva, historial y asistente.
- Probar camara, galeria y visor 3D solo en un telefono compatible. La RA debe
  informar claramente si no hay recurso o soporte disponible.

## 4. Pruebas de error y consistencia

Estas pruebas son obligatorias antes de afirmar que la aplicacion funciona bien.

| Caso               | Accion                                               | Resultado correcto                                   |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| Doble clic         | Confirmar checkout o venta dos veces                 | Una sola venta por clave de idempotencia             |
| Stock insuficiente | Solicitar mas de lo disponible                       | Mensaje claro, sin pago ni stock negativo            |
| Sesion vencida     | Borrar token o esperar vencimiento                   | Solicita iniciar sesion, no deja datos privados      |
| Permiso ajeno      | Cambiar manualmente un ID en URL                     | 403 o recurso no encontrado, sin filtracion          |
| Red interrumpida   | Cortar red durante checkout                          | Opcion de reintentar el mismo pedido, sin duplicarlo |
| Datos invalidos    | Email, fecha, cantidad o campos requeridos invalidos | Error de validacion legible, sin 500                 |
| Actualizar pagina  | Recargar despues de una compra                       | Historial y stock conservan el resultado real        |

Al terminar, revisar que en Network no haya respuestas 500 y que la consola del
navegador no tenga errores no controlados. Revisar tambien la terminal de NestJS
por excepciones no manejadas.

## 5. Criterio de aprobacion

El ensayo se considera aprobado si:

- RC-01 a RC-04 terminan sin intervencion manual en la base de datos.
- Los permisos bloquean acciones ajenas y los mensajes de validacion son claros.
- Inventario nunca queda negativo ni con `cantidad_reservada` mayor que la fisica.
- Una venta terminada aparece una sola vez en historial, inventario, caja y
  reportes correspondientes.
- Las funciones opcionales que no estan configuradas, como Stripe, IA o RA,
  informan su estado sin romper el resto de la aplicacion.

Registrar los casos fallidos con captura, cuenta usada, hora, pasos exactos y el
ID de la venta, reserva o producto afectado. Esa informacion permite reproducir y
corregir un error sin alterar la evidencia de las demas pruebas.
