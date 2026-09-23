# FashionStore: contexto y pendientes para continuar

Actualizado: **13 de septiembre de 2026 (tarde)**. Se completaron reportes y dashboard, IA (Gemini o local), notificaciones web y la dockerización para Azure.

Este documento resume el trabajo de la conversación y lo comprobado en el repositorio. Sirve para retomar otra sesión; los pendientes no son una orden de ejecutarlos todos automáticamente. Confirmar qué etapa solicita el usuario y contrastar este estado con los cambios posteriores del código.

## 1. Objetivo y decisiones del usuario

- Proyecto académico de Sistemas II. Se presentará una sola vez: priorizar un MVP demostrable y sencillo, sin complicaciones de producción innecesarias.
- Integrar **React con NestJS**, conservando preferentemente los contratos y reglas del backend. Adaptar React; analizar los cambios de backend cuando sean necesarios.
- **No revisar ni modificar mobile** en estas etapas. El alcance trabajado es backend y frontend web.
- Referencia principal: [Examen.md](recursos_contexto/Examen.md). Referencia de diseño: [diagrama de clases MVP](recursos_contexto/FashionStore_Diagrama_Clases_MVP_23.md). Distinguir estos documentos de las instrucciones directas del usuario.
- El usuario también pidió completar una lista ampliada: POS con turnos/arqueo, fotos múltiples, mayoristas, contra entrega, PWA y ventas offline, chatbot/recomendaciones, reportes por voz/texto con IA, responsive y RA.
- La fecha de entrega mencionada en la conversación fue **23 de septiembre**. No dar por actualizada esa fecha si la sesión se retoma después.
- No usar CMS ni frameworks de e-commerce prediseñados. El examen solicita **despliegue en Azure**.
- IA: el proveedor actual es **Gemini** y el diseño permite cambiar a una **IA local (Ollama)** solo con variables de entorno.
- Prioridad acordada para lo que falta: **backend → frontend → mobile**. Mobile se adapta al backend; no se cambian back ni front por mobile.

### Decisiones ya resueltas: no volver a diseñarlas desde cero

| Tema | Decisión implementada |
| --- | --- |
| Almacenes | Un almacén por sucursal, con nombre configurable. Comparte `branchId` y existencias de la sucursal. |
| Fotos | Hasta 8 URLs por producto; primera foto principal; carga de archivos con Cloudinary desde backend. |
| Mayorista | Depende de la clasificación del cliente, no de una cantidad mínima. Precio mayorista opcional por producto; no acumula promoción minorista. |
| Turnos | Cada cajero abre su propio turno. Un turno abierto por usuario y por caja física. |
| Offline | Ventas en efectivo a consumidor final, con turno abierto previamente con conexión. Cola persistente y sincronización posterior. |
| Stripe | Solo modo prueba. PaymentIntents y Payment Element en React; retiro en la sucursal seleccionada. |
| Contra entrega | Envío gratuito para la demo dentro de la ciudad de la sucursal; nombre, teléfono y dirección; coordinación por teléfono. Se registra la entrega y el efectivo recibido en un turno propio. |
| Proveedor | Edición directa de información de productos propios. Administración crea/asigna productos y controla precios, publicación, fotos, variantes y stock. No se implementó un circuito de propuestas/aprobaciones. |
| IA | `AI_PROVIDER=gemini\|ollama\|none`. La clave solo vive en backend. Si el proveedor falla, se responde con reglas y se informa `source: rules`. La IA de reportes elige filtros de una lista blanca, nunca SQL. |
| Despliegue | Imágenes Docker: API NestJS y web con nginx, que reenvía `/api` a la API en el mismo origen. En Azure: Container Apps, PostgreSQL Flexible Server y ACR. Ollama solo en local. |

## 2. Qué ya está implementado

Estas etapas tienen código integrado y pruebas; no equivalen a haber ensayado todos los recorridos en el navegador final de la presentación.

- [x] Autenticación real: registro, login, perfil, roles, rutas protegidas y cierre de sesión. Adaptadores entre DTO del backend y dominio español de React.
- [x] Catálogo y administración: productos, categorías, tallas, colores, temporadas, colecciones, proveedores, sucursales y usuarios.
- [x] Correcciones puntuales de backend: fechas de promoción y conversión de filtros `active=false`.
- [x] Inventario por sucursal y variante: existencias físicas/reservadas/disponibles, entradas inmediatas y programadas, recepción, ajustes, devoluciones e historial.
- [x] Carrito real: precios del servidor, variantes, cantidades y sucursales capaces de atenderlo. Agregar al carrito no aparta stock.
- [x] Reservas: varias prendas, visita programada, gestión del cliente y atención por sucursal, cancelación, vencimiento y liberación de stock.
- [x] Fotos múltiples, carga Cloudinary, almacén por sucursal y precios mayoristas.
- [x] POS: selección de variantes, cliente o consumidor final, cotización del servidor, venta y comprobante. Conversión parcial de reserva a venta.
- [x] Historial de ventas/compras y comprobantes con precios históricos e impresión.
- [x] Cajas físicas, apertura/cierre de turno, arqueo y diferencias de efectivo. Medios de pago separados en los acumulados.
- [x] PWA y ventas offline: descarga, tickets persistentes, reintento con el mismo UUID, sincronización y bloqueo del cierre hasta terminar.
- [x] Checkout web con Stripe: crear/retomar pago, confirmación en backend, cancelación, vencimiento y conciliación/reembolso de cobros tardíos.
- [x] Contra entrega: pedido pendiente con stock apartado, datos de entrega, cancelación y confirmación de entrega/cobro que actualiza stock, pago y turno juntos.
- [x] Proveedor: vínculo cuenta-proveedor en Usuarios, fichas propias, información de suministro, temporada/colección y entregas programadas. Propiedad y permisos validados por backend.
- [x] Reportes y dashboard en React con `/reports/*` reales:
  - Ventas por día, sucursal y canal; ranking; inventario paginado; reservas por estado.
  - Días en Bolivia y monedas separadas.
  - El encargado ve `/sucursal/reportes`, limitado a su sucursal.
- [x] IA en backend y React:
  - `/ai/status`, `/ai/assistant`, `/ai/recommendations` (guarda en `recomendaciones_ia`) y `/ai/reports`.
  - Página "Reportes con IA" con dictado de voz (Web Speech API) y texto como alternativa.
- [x] Notificaciones web:
  - Campana con contador que se actualiza cada 30 s, lista, "solo sin leer", marcar como leída y aviso toast.
  - Abre la reserva con `?reserva=ID`.
- [x] Cierre de huecos (13/09):
  - Reportes por hora (`hourly` en `/reports/sales`) y por caja o turno (`/reports/cash-shifts`), en React y en los reportes con IA.
  - `PATCH /auth/me` para editar nombre, teléfono y dirección, con "Mi perfil" en la web y edición en el perfil móvil.
  - Pruebas e2e de IA, modelos 3D y perfil.
- [x] Docker:
  - `docker-compose.yml` con db, backend, frontend y el perfil `ia-local` (Ollama).
  - Dockerfiles, nginx y guía [despliegue en Azure](docs/despliegue-azure.md).

### Guías de las etapas terminadas

- [Catálogo, almacenes, fotos y mayoristas](backend/docs/catalogo-almacenes-fotos.md)
- [POS conectado a React](backend/docs/pos-react.md)
- [Turnos y arqueo](backend/docs/turnos-caja.md)
- [Ventas offline y PWA](backend/docs/ventas-offline.md)
- [Checkout Stripe y contra entrega](backend/docs/checkout-react.md)
- [Portal de proveedor](backend/docs/proveedor-react.md)
- [Inteligencia artificial](backend/docs/ia.md)
- [Despliegue en Azure](docs/despliegue-azure.md)
- [README del frontend](frontend/README.md)

Algunas guías describen el estado al terminar una etapa anterior. Para saber qué sigue pendiente, usar este resumen y comprobar el código actual.

## 3. Pendientes por orden recomendado

### Etapa A — Clave de Gemini y prueba con el modelo real

- [x] Clave pegada en `backend/.env` por el usuario. La clave compartida en la conversación del 13/09 debe **rotarse** antes de producción.
- [x] Modelo `gemini-3.6-flash`. `gemini-2.5-flash` responde 404 porque ya no se habilita para cuentas nuevas. Los modelos 3.x rechazan `thinkingBudget`, así que el proveedor solo lo envía a 2.5 Flash.
- [x] Verificado por la web en Docker (`:8080`):
  - `/ai/status` responde `configured: true`.
  - El asistente responde con `source: gemini` en unos 4,5 s.
  - Las recomendaciones responden con `source: gemini:gemini-3.6-flash`.
- [ ] Ensayar en el navegador los reportes con IA por voz y las recomendaciones de cliente autenticado.
- Corrección: el `.env` de la raíz tenía `PUBLIC_API_URL=http://localhost:3000/api/v1`. La web del 8080 llamaba al 3000 y CORS bloqueaba las solicitudes. Ahora es `/api/v1` y `API_PORT=3001`, para no chocar con `npm run start:dev`.
- [ ] Opcional, IA local: `docker compose --profile ia-local up -d`, `ollama pull qwen2.5:3b`, `AI_PROVIDER=ollama` y `AI_TIMEOUT_MS=60000`.

### Etapa B — Despliegue real en Azure

La configuración ya está lista: [guía](docs/despliegue-azure.md), Dockerfiles y compose. **No se crearon recursos en Azure**: requieren la cuenta del usuario y tienen costo.

- [ ] Confirmar suscripción, región y presupuesto.
- [ ] Crear ACR, PostgreSQL Flexible Server y las Container Apps de API y web, siguiendo la guía.
- [ ] Guardar como secretos `DATABASE_URL` (con `sslmode=require`), `JWT_SECRET`, `GEMINI_API_KEY`, Stripe y Cloudinary.
- [ ] Cargar la semilla DEMO, configurar el webhook de Stripe con la URL pública y probar la PWA por HTTPS.

### Etapa C — Mobile adaptado al backend (hecha el 13/09, falta probar en teléfono)

Prioridad acordada: backend → frontend → mobile. Mobile se adaptó a los contratos actuales.

- [x] Capa de red:
  - `mobile/src/api/http.ts` desenvuelve `{ success, data }` y traduce los errores.
  - Adaptadores en `src/api/*.contratos.ts`, portados de la web.
  - Los mocks siguen disponibles con `EXPO_PUBLIC_USE_MOCKS=true`.
- [x] Servicios reales:
  - acceso;
  - catálogo con filtros en memoria;
  - disponibilidad pública;
  - carrito;
  - reservas y compras propias (`/mine`);
  - IA (asistente con historial y recomendaciones públicas o personalizadas).
- [x] Checkout móvil (canal `MOBILE`):
  - sucursal con stock, cotización `quoteHash` e idempotencia;
  - **Stripe con Stripe.js en un WebView** (funciona en Expo Go) o **contra entrega**;
  - consulta periódica hasta que NestJS confirma el pago.
- [x] Probador RA (decisión: **RA en el teléfono, sin IA**):
  - Backend: `GET/POST /products/:id/ar-resources` y `DELETE /products/:id/ar-resources/:resourceId` (alta y baja solo administrador; se desactiva, no se borra).
  - Web: sección "Probador virtual (RA)" en el formulario de producto para registrar la URL del GLB/GLTF/USDZ.
  - Mobile: el visor 3D y "Ver en tu espacio" leen esos recursos; el modo cámara funciona con la foto de cualquier prenda.
- [x] `mobile/.env`: `EXPO_PUBLIC_API_URL=http://192.168.100.140:3000/api/v1` (IP de la PC en la Wi-Fi), mocks apagados. Cambiar si cambia la red.
- [ ] Probar en un teléfono con Expo Go:
  - login;
  - carrito y checkout Stripe y contra entrega;
  - reservas;
  - asistente;
  - cámara, galería y visor 3D con un modelo registrado.
  - Si no conecta, permitir el puerto 3000 en el firewall de Windows (lo hace el usuario).
- [ ] Registrar al menos un modelo 3D real de prenda para la demo. La base no tiene ninguno; la prueba de contratos creó uno de ejemplo y lo desactivó.
- [x] (23/09) **Probador en vivo sobre la persona**: MediaPipe Pose en un WebView (Expo Go), la prenda sigue hombros/cadera. Verificado en Chrome headless con cámara simulada; **falta probar en teléfono**.
- [x] (23/09) `VirtualFittingModule` registrado en `AppModule` (antes no estaba) con `GET /virtual-fitting/status` y `POST /virtual-fitting/try-on` (foto con IA, Gemini imagen). Cuerpo JSON hasta 10 MB.
- [ ] La clave de Gemini del 23/09 tiene **cuota 0 para modelos de imagen** (capa gratuita): el try-on responde 503 hasta activar facturación. Texto sí funciona.
- [ ] Subir fotos reales de prendas (fondo claro) desde la web: la semilla solo tiene marcadores SVG de `placehold.co`, que el try-on rechaza (422) y que se ven como un recuadro en la RA.
- [ ] Redesplegar la API en Azure (el `mobile/.env` apunta allí) o apuntar el móvil a la IP local para usar el try-on.

### Etapa D — Ensayo general, responsive y entrega

- [ ] Datos coherentes de demo: varias sucursales, stock por variante, fotos, cliente mayorista, reserva, cajero con turno y proveedor vinculado.
- [ ] Recorridos con la API real: catálogo → carrito → Stripe; reserva → notificación → preparación → venta; contra entrega; offline; proveedor; reportes y reportes con IA por voz.
- [ ] Revisar escritorio y móvil, errores de red y navegación por rol. El dictado solo funciona en Chrome o Edge; en otros navegadores se escribe.
- [ ] Matriz de requisitos de `Examen.md`: cumplido, simplificado, pendiente o no verificado.
- [ ] Guion de demostración.

## 4. Mobile y realidad aumentada

- `mobile/` ya está conectado a la API real y compila (typecheck), pero **no se probó en un teléfono**: no afirmar que la RA o el pago móvil funcionan en hardware hasta ensayarlos.
- El probador no detecta el cuerpo. Tiene dos modos: la foto de la prenda superpuesta en la cámara, y el modelo 3D colocado en el espacio (ARCore o AR Quick Look). La app lo aclara en pantalla.

## 5. Límites del MVP que no son nuevas tareas obligatorias

Conservar estas simplificaciones salvo que el usuario pida cambiarlas:

- Un almacén por sucursal. No hay varios depósitos por sucursal ni traslados entre depósitos.
- En POS, tarjeta, QR y transferencia registran un pago externo con referencia; no hay integración bancaria automática. Stripe es la pasarela web.
- Contra entrega no incluye transportista, seguimiento ni tarifas.
- El proveedor actualiza fichas asignadas; los productos nuevos se crean desde administración. No hay aprobación de propuestas.
- La disponibilidad informada por el proveedor es una nota, no inventario vendible.
- Offline cubre solo efectivo y consumidor final, con descarga previa y turno abierto con conexión. No hay apertura ni cierre offline, pagos electrónicos offline ni sincronización con el navegador cerrado.
- Offline conserva precios de la descarga durante 24 horas. Si hay conflicto de stock, el ticket queda retenido.
- El respaldo offline se exporta a JSON; no hay pantalla de importación.
- No hay gestión general de devoluciones o reembolsos de ventas pagadas, fuera de la conciliación tardía de Stripe.
- Algunos filtros de catálogo e inventario recorren páginas en React.
- El historial de ajustes de inventario no guarda el valor anterior ni el final.
- Reportes por día, con desglose por hora local y reporte de turnos y cajas (`/reports/cash-shifts`), también disponibles desde los reportes con IA.
- La vista consolidada de inventario muestra disponibles, reservadas, agotadas y por ingresar. Las unidades **vendidas** están en los reportes de ventas y ranking, no por variante dentro del inventario.
- El proveedor edita los productos que tiene asignados; los productos nuevos los crea el administrador.
- Notificaciones por consulta periódica cada 30 s, sin sockets ni push. Solo avisan reservas nuevas a administradores y encargados. La demo con mocks no las simula.
- El límite de solicitudes de IA vive en memoria por instancia; en Azure hay una sola réplica de la API.

## 6. Entorno y precauciones al retomar

- Repositorio actual: `C:\Users\aleja\OneDrive\Documentos\Universidad\SI2\1er_Parcial_SI2`, rama `Alejandro`. El trabajo de esta sesión **no se ha commiteado**. Revisar `git status` y conservar los cambios.
- Backend: NestJS, Prisma y PostgreSQL. Frontend: React, TypeScript, Vite y TanStack Query.
- PostgreSQL de desarrollo en Docker, contenedor `fashionstore-db-1`, `localhost:5433`, bases `tienda_ropa` y `tienda_ropa_test`.
  - La contraseña local se generó y está en el `.env` de la raíz y en `backend/.env`; no copiarla.
  - En Windows hay otro PostgreSQL 17 como servicio en 5432; no se tocó.
- Se cargó la semilla DEMO el 13/09 (referencia 2026-09-13): 3 sucursales, 12 productos, 30 ventas, 7 reservas y 7 notificaciones.
  - `SEED_DEMO_PASSWORD` quedó en `backend/.env`.
  - La contraseña del administrador es la de `SEED_ADMIN_PASSWORD`.
- `frontend/.env`: `VITE_USE_MOCKS=false`, `VITE_API_URL=https://tiendaropa-backend.delightfulplant-4b0ba886.canadacentral.azurecontainerapps.io/api/v1` (API desplegada en Azure; para trabajar en local se cambia por `http://localhost:3000/api/v1`).
- Dependencias instaladas con `npm ci` en backend y frontend. OneDrive sincroniza `node_modules`; conviene pausar la sincronización o excluir esas carpetas.
- No ejecutar semillas generales para "empezar de nuevo" sin revisar sus efectos.

### Migraciones y pruebas conocidas

Siguen siendo **11 migraciones**. Esta etapa no agregó ninguna: IA usa la tabla existente `recomendaciones_ia`. No modificar migraciones aplicadas.

Verificaciones del 13/09:

| Área | Resultado |
|---|---|
| Backend unitarias | 184 correctas (37 archivos) |
| Backend HTTP e2e | 106 correctas (13 archivos, `TEST_DATABASE_URL` en Docker). Incluye IA con proveedor falso, modelos 3D, perfil propio, ventas por hora y turnos de caja |
| Frontend | 149 correctas (26 archivos, con render de dashboard, reportes, reportes con IA y campana), `tsc -b` y build/PWA correctos |
| Mobile | `tsc --noEmit` correcto; contratos verificados contra la API por IP de red |
| Lint | Frontend: 7 avisos que ya existían. Backend: limpio |
| Contratos contra la API real | Reportes (admin, encargado limitado, 403 del cajero) y `/ai/*` con respaldo de reglas |
| Docker (`docker compose up -d --build`) | Imágenes construidas. API *healthy* con migraciones automáticas. nginx sirve la SPA (respaldo a `index.html`, `sw.js` sin caché) y reenvía `/api` correctamente |

`tsc --noEmit` del backend ya tenía errores de tipos en `prisma/seed-sales.ts` y `src/modules/auth/auth.service.spec.ts`. No bloquean `nest build` ni las pruebas.

Comandos habituales (desde cada carpeta):

```powershell
# Base de datos (raiz)
docker compose up -d db
# Backend
npm run start:dev
npm test
$env:TEST_DATABASE_URL = '<valor de TEST_DATABASE_URL en backend/.env>'; npm run test:e2e -- --no-file-parallelism
# Frontend
npm run dev
npm test
npm run build
# Pila completa en contenedores (raiz): web en http://localhost:8080
docker compose up -d --build
```

Para PWA offline sin Docker: `npm run build` y `npm run preview -- --port 5173 --strictPort`.

## 7. Mensaje sugerido para abrir otra sesión

> Lee CONTEXTO_Y_PENDIENTES.md y comprueba el estado del repositorio. FashionStore es una demo académica. Prioridad: backend → frontend → mobile (mobile se adapta al backend). Ya están hechos reportes y dashboard, IA (Gemini o Ollama), notificaciones web y Docker para Azure. Siguen: probar con la clave real de Gemini, desplegar en Azure con el usuario, adaptar mobile y RA, y hacer el ensayo general. Conserva los cambios existentes y no rehagas etapas terminadas.

Actualizar este archivo al completar cada etapa.
