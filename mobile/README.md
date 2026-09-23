# FashionStore - Aplicacion movil

Aplicacion movil de FashionStore (MVP academico, Sistemas de Informacion II).
React Native + Expo + TypeScript. Esta orientada al **cliente**: catalogo,
carrito, compra, reservas para probar en tienda, historial, asistente de IA y
probador virtual.

La app consume la API NestJS real (`/api/v1`). Se adapto a sus contratos sin
cambiar el backend: los DTO en ingles se traducen al dominio en espanol en
`src/api/*.contratos.ts`.

La app no es un panel administrativo: la gestion de catalogo, inventario,
caja y reportes vive en el frontend web.

## Puesta en marcha

```bash
npm install
npm start
```

Se abre Metro con un codigo QR. Para probar en un telefono:

1. instalar **Expo Go** desde la tienda de aplicaciones;
2. estar en la misma red Wi-Fi que la computadora;
3. escanear el codigo QR.

Con un emulador Android configurado: `npm run android`.

### Vista previa en la computadora

```bash
npm run web
```

Abre la app en `http://localhost:8081` para recorrer las pantallas sin
telefono. Sirve para revisar catalogo, carrito, checkout, reservas e historial.

**No reemplaza la prueba en el telefono:** el probador virtual depende de la
camara y del visor de RA del sistema, y guardar en la galeria solo existe en el
dispositivo. Esas tres cosas se prueban con Expo Go.

| Script | Que hace |
|---|---|
| `npm start` | Servidor de desarrollo (Metro) |
| `npm run android` | Abre la app en un emulador o dispositivo Android |
| `npm run ios` | Abre la app en un simulador iOS (requiere macOS) |
| `npm run web` | Vista previa en el navegador de la computadora |
| `npm run lint` | Analisis estatico (oxlint, igual que la web) |
| `npm run typecheck` | Verificacion de tipos |
| `npm run doctor` | Revisa dependencias y configuracion de Expo |

## Variables de entorno

Copiar `.env.example` a `.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.0.12:3000/api/v1
EXPO_PUBLIC_USE_MOCKS=false
```

- `EXPO_PUBLIC_API_URL` incluye el prefijo `/api/v1`. Un telefono no llega a
  `localhost` de la computadora: usa la IP de la maquina en la misma Wi-Fi
  (`ipconfig` en Windows). En Azure, la URL publica de la API.
- El firewall de Windows debe permitir conexiones entrantes al puerto 3000 del
  backend; si el telefono muestra "No pudimos conectar con el servidor", revisar
  eso primero.
- `EXPO_PUBLIC_USE_MOCKS=true` vuelve al backend simulado local (demo sin NestJS).
- Las variables `EXPO_PUBLIC_*` se leen al iniciar Metro: reiniciar `npm start`
  despues de cambiarlas.

## Cuentas de prueba

Con la API real se usan las cuentas de la semilla DEMO del backend, por ejemplo
`cliente1@demo.fashionstore.test` con la contrasena `SEED_DEMO_PASSWORD`, o una
cuenta nueva creada desde Registrarme. La app es para clientes: carrito, compra
y reservas propias responden 403 para otros roles.

En modo mock: `cliente@fashionstore.bo` / `cliente123`.

## Arquitectura

```
Pantalla (features/*)
  -> hooks/*          estado remoto con TanStack Query
    -> services/*     contrato estable por dominio
      -> api/http.ts  adaptador unico (axios | mock)
        -> mocks/     backend simulado temporal
```

Reglas que sostienen el proyecto:

- Ninguna pantalla llama a `fetch`/`axios` directamente.
- Las rutas del backend viven solo en `src/api/endpoints.ts`.
- Los errores se normalizan a `ErrorApi` con mensajes en lenguaje humano.
- Cada pantalla importante contempla los cuatro estados: cargando, vacio, error
  y con datos.

### Estructura

```
src/
  api/          adaptador HTTP, mapa de endpoints y almacenamiento local
  components/   piezas de UI reutilizables (boton, campo, estados, chips, hoja)
  context/      sesion y avisos
  features/     un modulo por area funcional
    ar/ auth/ cart/ catalog/ checkout/ history/ ia/ product/
    profile/ reservations/
  hooks/        hooks de datos y claves de cache
  lib/          reglas de dominio, formato y validacion
  mocks/        backend simulado temporal
  navigation/   tabs, stack y tipos de rutas
  services/     servicios por dominio (lo unico que cambia al conectar NestJS)
  theme/        tokens de diseno
  types/        modelo de dominio (23 clases) y tipos de transporte
```

### Navegacion

```
Tabs: Inicio | Catalogo | Carrito | Reservas | Perfil
  Catalogo -> Producto -> Probador virtual
                       -> Nueva reserva -> Detalle de reserva
  Carrito  -> Checkout -> Resultado -> Mis compras -> Detalle de compra
  Perfil   -> Mis compras / Mis reservas / Asistente
  Acceso y Asistente se abren como modales
```

El catalogo es publico. Las pantallas que necesitan sesion no se ocultan:
muestran un estado que invita a entrar y vuelven a lo que el cliente estaba
haciendo. **La proteccion de pantallas es experiencia de usuario, no seguridad:
el backend es la autoridad final de autorizacion.**

## Modelo de dominio

`src/types/domain.ts` refleja las 23 clases del diagrama UML con los mismos
nombres de campo (`id_producto`, `cantidad_fisica`, etc.) que el frontend web.
NestJS responde en ingles y con `{ success, data }`: `src/api/http.ts`
desenvuelve la respuesta y los adaptadores de `src/api/*.contratos.ts` la
traducen, igual que en la web.

Reglas implementadas en `src/lib/domain.ts`:

- `stock_disponible = cantidad_fisica - cantidad_reservada`
- El inventario se identifica por **sucursal + producto + talla + color**
- Precio con promocion vigente: con la API real se usan `precio_actual` y
  `promocion_activa` calculados por NestJS; no existe una entidad `Promocion`.
- La consulta publica de disponibilidad solo informa unidades disponibles; la
  app las representa como stock fisico sin reservas.

En el detalle de producto esto se traduce en algo entendible: las tallas y los
colores sin stock aparecen tachados o apagados, la disponibilidad se muestra
por sucursal y la cantidad nunca supera lo que queda.

## Compra desde la app

Las compras usan el mismo checkout que la web con canal `MOBILE`:

1. El carrito informa que sucursales tienen stock de todas sus prendas.
2. `POST /sales/checkout/preview` calcula el total en el servidor (`quoteHash`).
3. `POST /sales/checkout` crea el pedido y aparta el stock, con clave de
   idempotencia para no duplicarlo si se reintenta.
4. Pago:
   - **Tarjeta (Stripe, modo prueba):** `POST /payments/stripe/intents` entrega
     el `clientSecret` y el formulario de Stripe.js se abre en un WebView
     (`PagoStripeWeb.tsx`). Funciona en Expo Go, a diferencia del SDK nativo que
     requiere un build de desarrollo. Tarjeta de prueba `4242 4242 4242 4242`.
     La app consulta `GET /sales/:id` hasta que NestJS confirma el cobro.
   - **Contra entrega:** nombre, telefono y direccion; se paga en efectivo al
     recibir y la sucursal registra la entrega.

Los datos de la tarjeta van directo a Stripe; ni la app ni NestJS los reciben.

## Probador virtual (realidad aumentada)

Es la funcionalidad con mas decisiones tecnicas detras, asi que conviene ser
preciso sobre **que hace y que no hace**.

### Alternativas evaluadas

| Opcion | Por que se descarto / eligio |
|---|---|
| ViroReact (ARKit/ARCore nativo) | Requiere build nativo propio, no corre en Expo Go y es pesado para los equipos modestos del equipo. Descartada. |
| three.js sobre expo-gl | Suma un motor 3D completo al bundle y sigue sin resolver el seguimiento del cuerpo. Descartada. |
| Deteccion de pose nativa (MediaPipe / TensorFlow como modulo RN) | No funciona en Expo Go. Descartada. |
| MediaPipe Pose Landmarker **dentro de un WebView** | El WebView del sistema ya trae camara, WebAssembly y WebGL: seguimiento real del cuerpo en Expo Go, con el modelo *lite*. **Elegida** como modo principal ("En vivo"). |
| Camara + superposicion ajustable | Funciona en cualquier telefono. Se conserva como modo "Manual" de respaldo. |
| IA generativa (Gemini, en el backend) | Foto realista de la persona usando la prenda. Opcional: requiere sesion y cuota de imagenes. |
| `<model-viewer>` en WebView | Delega en Scene Viewer (ARCore) y AR Quick Look (iOS): 3D en todos lados y RA nativa donde el sistema la soporta. **Elegida** para el `RecursoRA`. |

### Lo que quedo implementado

**Modo En vivo** (`src/features/ar/ProbadorEnVivo.tsx` + `paginaProbadorVivo.ts`):

- detecta hombros, cadera, rodillas y tobillos en cada cuadro (modelo *lite* en el telefono, *full* en la PC);
- deforma la foto con una malla entre dos lineas del cuerpo (hombros-cadera o cadera-rodillas): se estira con el torso y sigue inclinaciones y giros. Tipo Superior, Inferior o Vestido, deducido de la categoria;
- mide el ancho de hombros o cintura de la propia foto para dimensionarla; se ajusta arrastrando o pellizcando (mouse y rueda en la PC);
- quita el fondo de estudio respetando el contorno, incluso con prenda blanca sobre fondo blanco;
- mangas articuladas (hombro, codo, muneca); cara, cuello y manos se repintan con el video real por delante de la prenda;
- seguimiento con filtro One Euro (estable quieto, rapido en movimiento);
- talla segun quien posa: la silueta (segmentacion de MediaPipe) mide pecho y cintura sin brazos y ajusta la prenda entera, como maximo un 10%;
- de frente la prenda queda plana; al girar mas de ~15 grados envuelve un cilindro que sigue la profundidad 3D de los hombros;
- las mangas siguen el brazo solo si esta razonablemente estirado; volumen sutil y algo mas de contraste;
- en la PC ademas: pliegues y sombras copiados de la ropa real, tono de la luz de la escena y sombra de contacto;
- "Tomar foto" guarda la composicion en la galeria y, con sesion, ofrece "Foto realista con IA" (`POST /virtual-fitting/try-on`);
- necesita internet para descargar el detector (jsDelivr y Google Storage). El video no sale del telefono salvo que se pida la foto con IA.
- Para que se vea bien, las prendas deben tener **fotos reales sobre fondo claro** (la semilla solo trae marcadores de texto).


**Modo Camara** (`src/features/ar/ProbadorCamara.tsx`), disponible para
cualquier prenda:

- abre la camara (frontal o trasera) con `expo-camera`;
- superpone la imagen de la prenda;
- se arrastra con un dedo y se escala pellizcando (PanResponder + Animated, sin
  librerias de gestos adicionales);
- tres niveles de opacidad;
- toma la foto y arma la composicion final, que se puede guardar en la galeria.

La captura ocurre en dos tiempos a proposito: primero la foto de la camara y
despues la composicion foto + prenda sobre vistas normales. Capturar la vista
previa de la camara directamente devuelve un cuadro negro en varios telefonos
Android.

**Modo Modelo 3D** (`src/features/ar/VisorModelo3D.tsx`), solo cuando el
producto tiene un `RecursoRA` activo en formato GLB/GLTF/USDZ:

- visor 3D girable dentro de un WebView;
- boton "Ver en tu espacio" que abre el visor de RA del sistema operativo
  (ARCore en Android, AR Quick Look en iOS) cuando el equipo lo soporta.

**Limitacion declarada:** el modo Camara superpone la prenda, **no detecta el
cuerpo ni sigue el movimiento**; el modo Modelo coloca la prenda en el espacio,
no sobre la persona. La aplicacion lo dice en pantalla en lugar de aparentar un
seguimiento que no existe.

El motor de RA no se convirtio en una entidad del dominio: la app solo consume
`RecursoRA` (tipo, url, formato, activo), tal como define el diagrama.

**Donde se cargan los modelos:** el administrador registra la URL publica del
archivo GLB/GLTF/USDZ en la web (Productos -> Editar -> Probador virtual). La app
lo lee de `GET /products/:id/ar-resources`. El servidor que aloja el modelo debe
permitir CORS. No se usa IA para el probador: la RA se ejecuta en el telefono.

## IA

El asistente de estilo y las recomendaciones consumen `POST /ai/assistant` y
`GET /ai/recommendations`. NestJS usa Gemini o un modelo local (Ollama); si el
proveedor no responde, contesta con reglas sobre el catalogo y la app lo indica.
Las recomendaciones son publicas y se personalizan cuando hay sesion de cliente.

**La llamada a Gemini debe vivir en NestJS.** Una aplicacion movil se distribuye
como APK y cualquier clave incrustada en ella se puede extraer, asi que la app
nunca maneja la API key:

```
Movil -> NestJS -> Gemini API
```

En modo mock, `src/mocks/rutas/ia.ts` responde con una heuristica local.

## Rendimiento

La aplicacion tiene que seguir siendo usable en telefonos modestos:

- listas virtualizadas (`FlatList`) con paginacion de 10 productos y scroll
  infinito; nada de traer el catalogo completo;
- `expo-image` con cache en memoria y disco, y reciclado dentro de las listas;
- tarjetas de producto memoizadas;
- las mutaciones del carrito escriben el resultado en la cache en lugar de
  volver a pedir la lista;
- las entidades de apoyo (categorias, tallas, colores, sucursales) se cachean
  por media hora;
- la disponibilidad de un producto se pide una vez y el selector filtra en
  memoria, en lugar de consultar en cada toque;
- sin librerias de animacion ni de gestos: se usan `Animated` y `PanResponder`
  del propio React Native;
- sin fuentes descargables: se usan las familias del sistema.

## Mocks (demo sin backend)

Solo con `EXPO_PUBLIC_USE_MOCKS=true`. `src/mocks/` simula el backend con sus
propias rutas (`src/mocks/endpoints.ts`) y una latencia artificial para que se vean los estados de carga. Los datos son los
mismos que usa la web (12 productos, 3 sucursales, 5 categorias) y se conservan
en `AsyncStorage` para que una demostracion no pierda el carrito ni las reservas
al reiniciar la app.

Dos detalles del mock, equivalentes a los placeholders de imagen de la web:

- las imagenes vienen de `picsum.photos`;
- el `RecursoRA` apunta a un modelo 3D publico de demostracion, para que el
  visor y la RA se puedan probar de verdad.

Con la API real se usan los datos del backend.

## Endpoints de la API que usa la aplicacion

Todas bajo `EXPO_PUBLIC_API_URL` (`.../api/v1`).

| Modulo | Endpoints |
|---|---|
| Acceso | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` (el cierre de sesion es local) |
| Catalogo | `GET /products`, `GET /products/:id`, `GET /products/:id/ar-resources`, `GET /catalog/categories`, `GET /catalog/sizes`, `GET /catalog/colors`, `GET /branches` |
| Disponibilidad | `GET /inventory/availability?productId&sizeId&colorId&branchId` |
| Carrito | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `DELETE /cart/items` |
| Reservas | `GET /reservations/mine`, `GET /reservations/:id`, `POST /reservations`, `PATCH /reservations/:id/cancel` |
| Compras | `GET /sales/mine`, `GET /sales/:id`, `POST /sales/checkout/preview`, `POST /sales/checkout`, `PATCH /sales/:id/cancel` |
| Pagos | `POST /payments/stripe/intents` |
| IA | `POST /ai/assistant`, `GET /ai/recommendations` |

La forma de cada respuesta esta en los adaptadores de `src/api/*.contratos.ts`.

## Estado actual

- Conectada a la API real (13/09/2026): `npm run typecheck` pasa y el lint no
  tiene errores (solo avisos previos del probador y el catalogo).
- Contratos verificados contra NestJS por la IP de red:
  - catalogo, disponibilidad, sucursales y modelos 3D;
  - carrito y cotizacion de checkout;
  - reservas y compras propias;
  - recomendaciones con Gemini.
- Vista previa web con la API real: inicio con recomendaciones y detalle de
  producto sin errores de consola.
- Pendiente en telefono con Expo Go:
  - inicio de sesion;
  - pago Stripe en el WebView;
  - camara, galeria y visor de RA (dependen de hardware real).
