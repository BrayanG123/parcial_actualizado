# FashionStore - Frontend Web

Aplicacion web de FashionStore (MVP academico, Sistemas de Informacion II).
Para retomar el trabajo en otra sesion: [contexto y pendientes actuales](../CONTEXTO_Y_PENDIENTES.md).
React + TypeScript + Vite. Cubre la tienda para clientes y los paneles internos
de administracion, sucursal, caja y proveedor.

La integracion con NestJS se realiza por etapas. Ya estan conectados:

- Registro, login, perfil, permisos de navegacion y cierre de sesion.
- Catalogo publico, ficha, tallas/colores y disponibilidad por sucursal.
- Administracion de productos/promociones, categorias, tallas, colores,
  temporadas, colecciones, proveedores y sucursales.
- Usuarios, perfiles de cliente/empleado y asignacion/revocacion de roles.
- Inventario interno, entradas inmediatas/programadas, recepcion, ajustes,
  devoluciones e historial por variante/sucursal.
- Carrito del cliente con precios vigentes, alertas y disponibilidad por tienda.
- Reservas de varias prendas, listado/cancelacion del cliente y atencion en sucursal.
- Galeria de hasta 8 fotos por producto, carga de archivos mediante Cloudinary y seleccion de foto principal.
- Clientes mayoristas administrados desde Usuarios y precio mayorista opcional por producto.
- Nombre del almacen unico de cada sucursal, visible en administracion e inventario.
- POS con variantes, clientes mayoristas, revision del total, cobros y conversion parcial de reservas.
- Historial de ventas/compras y comprobantes con precios historicos e impresion.
- Cajas fisicas, turno propio con saldo inicial, cierre y arqueo con faltante/sobrante e historial por permisos.
- Ventas offline en efectivo a consumidor final: PWA, descarga de precios/stock, cola durable y sincronizacion sin duplicados.
- Checkout con Stripe en modo prueba y pedidos contra entrega con cobro en turno, cancelacion y recuperacion de solicitudes.
- Proveedor: cuenta asociada desde Usuarios, fichas propias, disponibilidad de suministro y consulta de entregas programadas.

Configuracion y reglas de esta etapa: [catalogo, almacenes y fotos](../backend/docs/catalogo-almacenes-fotos.md).

Guia para probar caja: [POS conectado a React](../backend/docs/pos-react.md).

Guia de esta etapa: [turnos de caja y arqueo](../backend/docs/turnos-caja.md).

Guia para la presentacion: [ventas offline y PWA](../backend/docs/ventas-offline.md).

Guia para pagar y entregar pedidos: [checkout con Stripe y contra entrega](../backend/docs/checkout-react.md).

Guia para proveedores: [vinculacion de cuenta y portal](../backend/docs/proveedor-react.md).

**Pendiente:** notificaciones y reportes/dashboard conservan los contratos de la demo. Sus
pantallas todavia pueden mostrar errores con la API real. IA queda para el final;
las recomendaciones automaticas solo se consultan en modo demo.

## Puesta en marcha

Para publicar la imagen Docker en Azure Container Apps, seguir el
[manual de despliegue del frontend](../docs/despliegue-azure-frontend.md). La
guía reutiliza el entorno, backend e identidad administrada definidos en el
[manual de despliegue del backend](../docs/despliegue-azure.md).

```bash
npm ci
npm run dev
```

Scripts disponibles:

| Script            | Que hace                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo en http://localhost:5173                       |
| `npm run build`   | Verificacion de tipos + build de produccion                           |
| `npm run preview` | Sirve el build generado                                               |
| `npm run lint`    | Analisis estatico (oxlint)                                            |
| `npm test`        | Contratos HTTP, formularios, autenticacion, sesion y rutas protegidas |

## Variables de entorno

Copiar `.env.example` a `.env` (o `.env.local`). Apunta por defecto a la API
desplegada en Azure Container Apps:

```
VITE_API_URL=https://fashionstore-backend.delightfulflower-0ec0e697.eastus2.azurecontainerapps.io/api/v1
VITE_USE_MOCKS=false
```

Para trabajar contra el backend local usar en su lugar
`VITE_API_URL=http://localhost:3000/api/v1`.

La API real es el modo predeterminado incluso sin archivo de entorno. Para usar
la demo local hay que establecer explicitamente `VITE_USE_MOCKS=true`. Reiniciar
Vite tras cambiar estas variables. El backend debe incluir el origen de Vite
(normalmente `http://localhost:5173`) en `CORS_ORIGINS`; el despliegue de Azure
ya lo permite.

En modo real usar una cuenta de PostgreSQL o registrar un cliente desde
`/registro`. Las cuentas indicadas abajo pertenecen exclusivamente a la demo.
Los tokens se separan por modo y URL de API; las sesiones antiguas requieren
volver a iniciar sesion.

## Cuentas de prueba (mock)

| Rol                   | Correo                    | Contrasena   |
| --------------------- | ------------------------- | ------------ |
| Administrador         | admin@fashionstore.bo     | admin123     |
| Encargado de sucursal | encargado@fashionstore.bo | encargado123 |
| Cajero                | cajero@fashionstore.bo    | cajero123    |
| Cliente               | cliente@fashionstore.bo   | cliente123   |
| Proveedor             | proveedor@fashionstore.bo | proveedor123 |

La pantalla de login permite cargarlas con un clic solo en modo mock.

## Arquitectura

```
UI (features/*)
  -> hooks/*          estado remoto con TanStack Query
    -> services/*     contrato estable por dominio
      -> api/http.ts  adaptador unico (axios | mock)
        -> mocks/     datos temporales en memoria
```

Reglas que sostienen el proyecto:

- Ningun componente llama a `fetch`/`axios` directamente.
- Las rutas reales viven en `src/api/endpoints.ts`; las antiguas de la demo en `src/mocks/endpoints.ts`.
- Los errores se normalizan a `ErrorApi` con mensajes en lenguaje humano
  (nunca se muestra un `AxiosError` al usuario).
- La recuperacion de sesion diferencia una credencial invalida (401) de un
  fallo de red (reintento sin borrar el token). Un 403 no cierra la sesion.

### Contrato de autenticacion real

- `POST /auth/register`: `{ name, email, password, phone?, address? }`.
- `POST /auth/login`: `{ email, password }`.
- Ambos devuelven `{ success, data: { accessToken, tokenType, user }, timestamp }`.
- `GET /auth/me` usa `Authorization: Bearer <token>` y devuelve el usuario envuelto.
- `api/http.ts` retira solo el envoltorio exterior; `api/auth.contratos.ts`
  adapta los campos, los perfiles anidados y los cinco roles a la UI.
- `api/contratos.ts` convierte `{ data, meta }` en el paginado que usan las pantallas.
  Catalogo y organizacion ya usan este adaptador.
- Logout elimina la sesion local y la cache; no llama a un endpoint inexistente
  ni revoca el JWT en el servidor. El cierre se sincroniza entre pestañas.
- Registro exige contraseña de 8–72 caracteres con mayuscula, minuscula y numero.

### Catalogo y administracion real

- `GET /products` es paginado; `POST /products` y `PATCH /products/:id`
  reciben exclusivamente los campos de sus DTO. `DELETE` desactiva.
- `/catalog/categories`, `/catalog/sizes`, `/catalog/colors`, `/catalog/seasons`,
  `/catalog/collections` y `/catalog/suppliers` devuelven arrays. Temporadas,
  colecciones y proveedores se desactivan; categorias, tallas y colores se
  eliminan solo cuando el backend permite hacerlo por sus referencias.
- `/branches` devuelve paginas: los selectores cargan todas las sucursales
  activas. Administracion agrega las inactivas y permite reactivarlas.
- `/inventory/availability` expone solo disponibilidad publica. React no inventa
  cantidades fisicas o reservadas que este endpoint no entrega.
- Productos requieren categoria, temporada, coleccion de esa temporada,
  proveedor, tallas y colores. Los selectores comprueban relaciones activas.
- Los formularios distinguen crear/editar: no envian `active` en creaciones que
  no lo admiten. Las fechas se presentan como dias de calendario; editar otro
  dato del producto no reescribe sus fechas. Vaciar ambas fechas envia `null`.
- `/users` recibe roles enum en la creacion. Editar usa `PATCH` sin roles ni
  contrasena vacia y envia solo campos de perfiles existentes. Una cuenta puede
  ser cliente y empleado simultaneamente. Cajeros/encargados requieren sucursal.
- `/roles` contiene las cinco definiciones del sistema (lectura). Desde Usuarios,
  el boton Roles usa `POST/DELETE /roles/users/:userId/:role`; cada accion se
  guarda por separado. No se ofrecen altas/bajas ficticias de definiciones de rol.
- Modificar la propia cuenta refresca la sesion; desactivarla cierra la sesion.

La API de productos aun no permite ordenar ni filtrar por promocion o sucursal.
Para conservar esos controles, React recorre las paginas coincidentes, combina
la disponibilidad cuando corresponde y filtra/ordena **antes** de paginar el
resultado. La busqueda simple sigue usando paginacion en el servidor. Esta
solucion conserva el backend, pero para un catalogo grande conviene analizar
filtros y ordenacion del lado de NestJS para cumplir RNF02 con menor trafico.

Validacion de esta etapa: `npm test` cubre contratos con transporte HTTP simulado
(respuestas del contrato real), multiples paginas y formularios en DOM. El build
comprueba tipos y empaquetado. No sustituye una prueba de extremo a extremo con
PostgreSQL y usuarios reales.

### Inventario y carrito real

- `GET /inventory` devuelve existencias fisicas y reservadas. El backend limita
  los encargados a su sucursal; administracion puede consultar todas.
- Busqueda por nombre y stock critico (disponible <= 3) se aplican sobre todas
  las paginas autorizadas antes de paginar, porque la API no incluye esos filtros.
- Entrada de mercaderia permite seleccionar producto activo, talla, color y
  sucursal. `POST /inventory/entries` crea el registro de inventario si hace falta.
- Una entrada `PENDING` exige fecha/hora futura y no aumenta las existencias.
  Desde Movimientos se confirma la recepcion con
  `POST /inventory/movements/:movementId/complete` y se actualiza el stock.
- Ajustes usan `POST /inventory/:id/adjustments` con el **stock fisico final**,
  permiten cero y respetan la cantidad reservada. Devoluciones usan
  `POST /inventory/:id/returns`. Ambos formularios exigen explicar el motivo.
- El historial se abre desde cada fila de Inventario y consulta
  `GET /inventory/:id/movements`, con filtros de tipo/estado. La API no dispone
  de un listado global de movimientos. Reservas, ventas y retenciones de compra
  aparecen en el historial pero se generan desde sus operaciones, no manualmente.
- Cada escritura refresca inventario, historial, disponibilidad, productos y
  carrito. No se alteran cantidades localmente sin confirmacion del servidor.
- Carrito usa `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:id` y
  `DELETE /cart/items` para vaciar. Solo se envian ids y cantidades; los precios,
  subtotales y total los calcula NestJS. No se inventa un clientId ausente en la respuesta.
- React muestra cambios de precio respecto al guardado, productos/variantes
  inactivos, stock insuficiente y sucursales capaces de abastecer todo el carrito.
  La ficha respeta el maximo de una sola sucursal, la cantidad ya agregada y el
  limite de 100 unidades por variante. Agregar al carrito no reserva stock.
- Las modificaciones del carrito se serializan, cancelan lecturas anteriores y
  no guardan respuestas de otra sesion ni ejecutan cambios en cola bajo otra cuenta.
- Checkout y entregas de proveedor se integraron en etapas posteriores: ver las
  guias de checkout y proveedor enlazadas al inicio de este documento.

Esta etapa no modifica NestJS. Dos mejoras futuras que requieren analizar el
backend: filtros de inventario en el servidor para grandes volumenes y un
historial de ajustes que guarde cantidad anterior/final; hoy entrega la magnitud
absoluta del cambio y la observacion, sin indicar por si solo si subio o bajo.

### Reservas reales

- Creacion: `POST /reservations` con `branchId`, `approximateTime` ISO con zona
  horaria, `observation` y `items` (productId, sizeId, colorId, quantity).
  React valida una visita futura, 1-50 variantes distintas, 1-100 unidades por
  variante y observacion de hasta 500 caracteres. NestJS valida y reserva todas
  las prendas en una transaccion; no se reduce stock de forma optimista en React.
- La seleccion fija la sucursal mientras contiene prendas para evitar enviar
  disponibilidad comprobada en otra tienda. El selector de productos es paginado
  y diferencia errores de carga, falta de stock y resultados vacios.
- Cliente: `GET /reservations/mine` usa una cache separada del listado operativo,
  tambien en cuentas que combinan CUSTOMER y otros roles. El listado es paginado
  y la reserva recien creada se destaca aunque su horario la ubique en otra pagina.
- Operaciones: `GET /reservations`, con filtro de estado/sucursal y paginacion.
  El backend limita al encargado a su sucursal. `GET /reservations/:id` devuelve
  las relaciones y fechas reales, incluyendo `reservedAt` y `expiresAt`.
- `PATCH /reservations/:id/status` sigue PENDING -> PREPARING -> READY ->
  CUSTOMER_PRESENT -> COMPLETED. Se permite CANCELLED desde los estados activos.
  El cliente cancela con `PATCH /reservations/:id/cancel` solo antes de presentarse.
- EXPIRED es automatico del backend. La interfaz muestra su plazo y actualiza
  listados/detalle cada 30 segundos mientras se consultan; no marca vencida una
  reserva manualmente ni calcula otra fecha de expiracion.
- Cerrar atencion libera las prendas pendientes/preparadas que siguen reservadas;
  no registra ventas o pagos. El formulario pide confirmar esa consecuencia.
- Tras crear, cancelar o cambiar estado se invalidan listados/detalle, inventario,
  movimientos, disponibilidad, productos, carrito y reportes. Se hace tambien
  ante errores: un 409 de NestJS puede haber vencido la reserva y liberado stock.
- Crear una reserva ya genera la notificacion a la sucursal en el backend. Esta
  etapa no conecta una bandeja de notificaciones ni promete avisos externos al cliente.

Verificacion: contratos HTTP simulados, casos limite y pantallas en DOM con
`npm test`; compilacion con `npm run build`. La validacion completa con PostgreSQL
requiere tener la API local en ejecucion. Esta etapa no modifica el backend.

### Estructura

```
src/
  api/          adaptador HTTP y mapa de endpoints
  components/   piezas de UI reutilizables (estados, modal, badges, paginacion)
  context/      sesion (AuthContext) y notificaciones (ToastContext)
  features/     un modulo por area funcional
    admin/ auth/ cart/ catalog/ checkout/ ia/ inventory/
    pos/ reports/ reservations/ sales/ supplier/
  hooks/        hooks de datos + claves de cache
  layouts/      shell de tienda y shell de panel interno
  lib/          reglas de dominio, formato y validacion
  mocks/        backend simulado temporal
  routes/       guards, navegacion lateral y permisos por area
  services/     servicios por dominio (lo unico que cambia al conectar NestJS)
  styles/       tokens de diseno y hojas de estilo
  types/        modelo de dominio (23 clases) y tipos de transporte
```

## Modelo de dominio

`src/types/domain.ts` conserva los nombres del modelo de las pantallas
(`id_producto`, `cantidad_fisica`, etc.). NestJS usa su propio contrato en ingles:
la traduccion se realiza en adaptadores explicitos y no cambiando el backend.

Reglas de negocio implementadas en `src/lib/domain.ts`:

- La disponibilidad publica utiliza `availableQuantity` del backend. Solo el inventario interno/mock calcula `cantidad_fisica - cantidad_reservada`.
- El inventario se identifica por **sucursal + producto + talla + color**
- La API real determina `currentPrice` y `promotionActive`; la demo calcula el precio con fechas y descuento;
  no existe una entidad `Promocion`, tal como define el MVP.

## Roles y rutas

| Area           | Rutas                                                                       | Roles              |
| -------------- | --------------------------------------------------------------------------- | ------------------ |
| Tienda         | `/`, `/catalogo`, `/producto/:id`                                           | publico            |
| Cliente        | `/reservas/nueva`, `/carrito`, `/checkout`, `/mis-compras`, `/mis-reservas` | CLIENTE            |
| Administracion | `/admin/...`                                                                | ADMINISTRADOR      |
| Sucursal       | `/sucursal/...`                                                             | ENCARGADO_SUCURSAL |
| Caja           | `/caja`, `/caja/ventas`, `/caja/turnos`, `/caja/offline`                                                     | CAJERO, ENCARGADO_SUCURSAL, ADMINISTRADOR |
| Proveedor      | `/proveedor/...`                                                            | PROVEEDOR          |
| Tiendas (SaaS) | `/empresas`, `/t/:slug/...`                                                 | publico            |
| Plan empresa   | `/admin/plan`                                                               | ADMINISTRADOR      |
| Plataforma     | `/plataforma/login`, `/plataforma`                                          | PLATFORM_ADMIN (sesion propia) |
| Offline        | `/offline`, `/pendientes`, `/caja/offline`, `/caja/pendientes`              | cliente / personal |
| Cambios        | `/caja/cambios` (online y offline, notas de credito)                        | CAJERO, ENCARGADO_SUCURSAL, ADMINISTRADOR |

### PWA offline (parcial 2)

Datos offline en **IndexedDB** (`src/offline/`), operaciones con UUID y estados
`LOCAL/SENDING/CONFIRMED/REJECTED/CONFLICT/RETRY` (+ `DESCARTADA`, nunca se borran) y
contrato `/sync/operations`. Detalle y recorrido de demostracion en
[ventas offline y PWA](../backend/docs/ventas-offline.md#pwa-offline-parcial-2).

### SaaS multitenant (parcial 2)

- **Tienda activa** (`src/api/empresa.ts`): `/t/:slug/...` fija la empresa y continua
  en la ruta normal (`/t/empresa-b/catalogo` -> `/catalogo`); `/empresas` lista las
  tiendas (`GET /tenant/directory`). Sin sesion, cada peticion envia `X-Tenant`; con
  sesion manda la empresa del token (el backend rechaza un header distinto). El login
  adopta la empresa que devuelve la API y cambiar de tienda cierra la sesion. Al
  cambiar de empresa se limpia la cache de TanStack Query.
- **Plan de la empresa** (`usePlanEmpresa`, `GET /tenant/subscription`): el menu oculta
  lo que el plan no incluye (p. ej. Reportes con IA en Basico), el panel muestra
  empresa y plan, y `AvisoSuscripcion` avisa el modo **solo lectura** o el
  vencimiento cercano. Es UX: el backend vuelve a validar plan y suscripcion.
- **Mensajes por codigo** (`MENSAJES_CODIGO` en `src/api/http.ts`):
  `SUBSCRIPTION_READ_ONLY`, `PLAN_FEATURE_REQUIRED`, `PLAN_LIMIT_REACHED`,
  `PLAN_LIMIT_EXCEEDED`, `TENANT_MISMATCH`, `TENANT_INACTIVE`; `ErrorApi.codigo`
  conserva el codigo.
- **Plataforma** (`/plataforma`): empresas, cambio de plan, renovacion simulada,
  suspension/reactivacion, historial y edicion de limites/funcionalidades de los
  planes. Usa un token separado (`apiPlataforma`) que no se mezcla con la tienda.
  En la demo con mocks: `plataforma@fashionstore.bo` / `plataforma123`.
- Pruebas: `test/saas.test.tsx`.

Los permisos por area estan centralizados en `src/routes/permisos.ts` y los usan
tanto los guards del router como la redireccion posterior al login.

> La proteccion de rutas es experiencia de usuario, no seguridad: **el backend es
> la autoridad final de autorizacion** y debe validar cada peticion.

## Mocks temporales

`src/mocks/` contiene la demo temporal. Autenticacion ya replica el DTO real;
los demas modulos conservan el contrato anterior. La demo utiliza
latencia artificial para que se vean los estados de carga. Los datos son
minimos (12 productos, 3 sucursales, 6 usuarios, 8 ventas) y se conservan en
`sessionStorage` para que una demostracion no se pierda al recargar.

Reservas, POS, turnos, ventas offline, checkout con Stripe, contra entrega e historiales ya estan integrados. IA y notificaciones/reportes
requieren su propia integracion; el proximo bloque se definira con el usuario. Al migrar cada modulo hay que adaptar
conjuntamente sus rutas, metodos, DTO, permisos y flujo de negocio; cambiar solo
el endpoint no completa la integracion. Los mocks se importan bajo demanda.

## IA y realidad aumentada

- El asistente de estilo y las recomendaciones consumen `/ia/asistente` y
  `/ia/recomendaciones`. La llamada a Gemini debe vivir en NestJS: **la API key
  nunca se coloca en el frontend**.
- La realidad aumentada es responsabilidad de la app movil. La web solo indica
  que una prenda tiene recurso RA disponible.

## Notas

- Las imagenes del catalogo mock usan un servicio publico de placeholders
  (`picsum.photos`); al cargar productos reales se reemplaza `imagen_url`.
  Si no hay conexion, cada tarjeta muestra una silueta de respaldo.
- La interfaz es responsive (escritorio, laptop, tablet y pantallas pequenas),
  pero no pretende sustituir a la aplicacion movil.
