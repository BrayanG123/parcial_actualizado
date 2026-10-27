# FashionStore — Plan del Segundo Parcial (SaaS multitenant + offline + IA)

> **Único archivo de seguimiento del parcial 2.** Aquí está el contexto, las decisiones, la lista de
> tareas y la bitácora. **No crear otros archivos de avance, resúmenes ni "progreso".**
> Enunciado original: `recursos_contexto/Examen2.md` (copia del enunciado de la ingeniera).

---

## 0. Reglas para quien desarrolle (Claude web, Claude Code o una persona)

1. **Leer este archivo completo antes de tocar código** y retomar desde la primera tarea sin tachar
   de la fase en curso.
2. **Al terminar una tarea, tacharla aquí mismo**, en el mismo commit que la implementa:
   - Pendiente: `- [ ] **F2.3** Texto`
   - Hecha: `- [x] ~~**F2.3** Texto~~ — 2026-10-28, commit `abc1234``
   - Parcial: dejarla `[ ]` y agregar debajo `  - ⏳ Falta: …` (una línea, sin crear archivos).
3. **Bitácora** (sección 9): al final de cada sesión agregar **una sola entrada corta** (fecha, qué
   se hizo, qué quedó a medias, próximo paso). No una entrada por tarea.
4. **Prohibido** crear archivos de seguimiento (`PROGRESO.md`, `AVANCE_*.md`, `RESUMEN_*.md`,
   `TODO_*.md`, etc.). La documentación técnica permitida está listada en la sección 7.
5. Rama de trabajo: **`parcial2`** (creada desde `main`). Commits pequeños por tarea, mensajes en
   español (`feat(tenant): …`, `test(sync): …`). Abrir PR a `main` al cerrar cada fase.
6. **Antes de cada commit** correr las verificaciones del paquete tocado (sección 1.4). No
   commitear con pruebas rotas; si una prueba existente queda obsoleta por diseño, adaptarla y
   explicarlo en el mensaje.
7. **No romper lo que ya funciona** del parcial 1 (catálogo, carrito, reservas, POS, Stripe de
   prueba, contra entrega, push, probador RA, reportes). Toda tabla nueva o modificada va con
   migración Prisma; nunca editar migraciones ya aplicadas.
8. **Secretos**: nunca escribir valores de `.env`, claves ni contraseñas en el código, la
   documentación ni los commits. Usar nombres de variables y `.env.example` con valores ficticios.
9. **Azure no se toca desde Claude web** (no tiene credenciales). Dejar las tareas de despliegue
   (fase F11) para Claude Code local.
10. Móvil: es **Expo SDK 57**; leer `mobile/AGENTS.md` (docs versionadas
    `https://docs.expo.dev/versions/v57.0.0/`) antes de usar APIs de Expo. Cambios nativos (nuevos
    módulos como `expo-sqlite`) **requieren generar APK nueva**; no funcionan solo con OTA.
11. Si una decisión de la sección 3 resulta inviable, **no improvisar otra en silencio**: anotar el
    problema en la tarea con `⚠️` y la alternativa propuesta.

---

## 1. Contexto del proyecto (estado al cierre del parcial 1)

### 1.1 Stack real (se mantiene en el parcial 2)

| Capa | Tecnología | Carpeta |
|---|---|---|
| Backend API | **NestJS 11 + Prisma 7 + PostgreSQL 17**, TypeScript, Vitest | `backend/` |
| Web | **React 19 + Vite + TanStack Query**, PWA propia (`scripts/generar-sw.mjs`), Vitest | `frontend/` |
| Móvil | **React Native 0.86 + Expo SDK 57**, TanStack Query, AsyncStorage | `mobile/` |
| IA | Gemini por API (`AI_PROVIDER=gemini\|ollama\|none`), Ollama local opcional | `backend/src/modules/ai` |
| Infra | Docker; Azure Container Apps (entorno `fashionstore-env`, eastus2), PostgreSQL Flexible (centralus), ACR `fashionstoreacr` | `docs/despliegue-azure.md` |

> ✅ **Decisión confirmada por el equipo (2026-10-27): no se cambian lenguajes ni frameworks.** El enunciado menciona *Angular* (PWA) y *Flutter + SQLite*
> (móvil). Se mantienen **React (PWA)** y **React Native/Expo con `expo-sqlite`**, que cumplen las
> mismas capacidades (instalable, offline, SQLite). Justificarlo en la documentación (RNF08).

### 1.2 Lo que YA existe y se reutiliza (no rehacer)

- Autenticación JWT, roles `ADMINISTRATOR`, `BRANCH_MANAGER`, `CASHIER`, `CUSTOMER`, `SUPPLIER`.
- Catálogo completo (productos, variantes talla/color, categorías, temporadas, colecciones,
  proveedores, fotos Cloudinary), inventario por sucursal con kardex (`movimientos_inventario`).
- Carrito, checkout Stripe (modo prueba), contra entrega, reservas con vencimiento, POS con turnos
  de caja y arqueo, comprobantes.
- **Ventas offline web ya implementadas** (`frontend/src/lib/offline.ts`,
  `features/pos/PaginaOffline.tsx`, `backend/docs/ventas-offline.md`): descarga de lote
  (`lotes_offline` / `OfflineBatch`), tickets con UUID, reintento idempotente
  (`@@unique([createdById, idempotencyKey])` en `Sale`). **Hoy guarda en `localStorage`** → migrar
  a IndexedDB y ampliar.
- **PWA ya instalable** (manifest + service worker generado en el build).
- **Reportes con IA ya existen** (`POST /ai/reports`, `backend/docs/ia.md`): la IA elige filtros de
  una **lista blanca** (`sales`, `top-products`, `inventory`, `reservations`), nunca escribe SQL;
  dictado por voz (Web Speech API); exportación PDF/Excel (`frontend/docs/exportacion-reportes.md`).
- Filtro de stock en servidor: `GET /products?inStock=true&branchId=N`.
- Push Android (FCM) para eventos de reservas y compras; probador RA (MediaPipe) en móvil y web.
- Pruebas: backend ~212, web ~167, móvil (node:test) 11.

### 1.3 Lo que NO existe todavía

Tenants/empresas, planes, suscripciones, aislamiento por empresa, administración de plataforma,
SQLite en móvil, modo vendedor en móvil, reservas offline (web y móvil), endpoint de
sincronización unificado con estados/conflictos, cambios de prendas, reportes generativos con
gráficos dinámicos y multi-tabla ampliados, módulo de Machine Learning, documentación ICONIX.

### 1.4 Verificaciones obligatorias antes de commitear

```bash
# backend
cd backend && npx tsc --noEmit -p tsconfig.build.json && npx vitest run && npx oxlint src/
# frontend
cd frontend && npm test && npx tsc -b && npx oxlint
# mobile
cd mobile && npm run typecheck && npm run lint && npm run test:push && npm run test:reservas && npm run test:offline
# (agregar aquí los scripts de prueba nuevos que se creen, p. ej. test:sync)
# ml-service (una vez: pip install -r requirements-dev.txt)
cd ml-service && pytest -q
```

---

## 2. Requisitos del parcial 2 (resumen del enunciado)

| Desafío | Qué pide | Fase |
|---|---|---|
| I. ICONIX | Casos de uso → robustez → secuencia → clases, trazabilidad, foco en lo nuevo/modificado | F1, F12 |
| II. PWA | Instalable, catálogo offline, reserva y venta de contado offline, pendientes, persistencia, sincronización con estados, aviso de datos desactualizados | F5 |
| III. Móvil + SQLite | Subconjunto del catálogo, reservas y ventas offline, pendientes, reinicio sin pérdida, sincronización, resultado | F6 |
| IV. Ventas offline | Registro completo (UUID, empresa, sucursal, usuario, cliente, fecha, variantes, precios, total, pago, estado), consistencia de inventario, **cambios de prendas en un plazo** | F4, F7 |
| V. Reportes generativos + ML | Lenguaje natural (texto/voz), ≥4 tipos con filtros variables, multi-tabla, tabla/gráfico, export Excel/PDF, ambigüedad, seguridad por tenant; ML con datos sintéticos, modelo supervisado y no supervisado, evaluación, dashboard | F8, F9 |
| VI. SaaS multitenant | Empresa/tenant, planes (Básico/Profesional configurables), suscripciones, ≥2 empresas, aislamiento en backend | F2, F3 |
| RNF01–12 | Seguridad, aislamiento, persistencia offline, integridad, idempotencia, recuperación, mantenibilidad, compatibilidad, rendimiento, observabilidad, pruebas, coherencia UML | F10, F12 |

---

## 3. Decisiones de arquitectura (acordadas)

### 3.1 Multitenancy (BD compartida, aislamiento lógico)
- Nuevas entidades: `Tenant` (empresa: nombre, `slug` único, estado), `Plan` (código, nombre,
  `maxActiveBranches`, `features` JSON: `aiReports`, `offline`, `conventionalReports`…),
  `Subscription` (tenant, plan, `startsAt`, `endsAt`, estado `ACTIVE|EXPIRED|SUSPENDED|CANCELLED`,
  historial de cambios de plan).
- **`tenantId` obligatorio** en toda entidad de negocio: `Branch`, `Category`, `Season`,
  `Collection`, `Supplier`, `Size`, `Color`, `Product` (y tablas puente), `Inventory`,
  `InventoryMovement`, `Client`, `Employee`, `Reservation`(+items), `Cart`(+items),
  `CashRegister`, `CashShift`, `OfflineBatch`, `Sale`(+items), `Payment`, `ArResource`,
  `AiRecommendation`, `Notification`, `PushToken`, y las tablas nuevas (sync, cambios).
  Las tablas hijas pueden heredar el tenant del padre, pero **las consultas de raíz siempre filtran
  por `tenantId`**.
- `User`: pertenece a un tenant (`tenantId` nullable solo para el **administrador de plataforma**,
  nuevo rol `PLATFORM_ADMIN`). Email único **por tenant** (`@@unique([tenantId, email])`).
- Los `@unique` globales actuales (nombre de categoría, talla, color, colección, proveedor,
  `[city, name]` de sucursal) pasan a **compuestos con `tenantId`**.
- **Resolución del tenant**:
  - Personal y clientes autenticados: el `tenantId` viaja en el **JWT** y el backend lo pone en un
    contexto de petición (AsyncLocalStorage).
  - Tienda pública (catálogo, registro, login de clientes): **código de empresa en la URL**
    (`/t/:slug/...` en la web; en móvil el cliente elige la tienda o viene configurada) → header
    `X-Tenant: <slug>` que el backend valida.
- **Aislamiento en backend** (no solo en la UI): extensión de Prisma / capa de repositorio que
  inyecta `tenantId` en lecturas y escrituras + verificación de pertenencia en cada recurso por id
  (responder 404 ante recursos de otro tenant). Opcional (defensa en profundidad): RLS de PostgreSQL.
- **Migración de datos**: lo existente pasa a la **Empresa A** (FashionStore, plan Profesional).
  Seed de **Empresa B** (plan Básico) con sus propias sucursales, usuarios, catálogo y stock.

### 3.2 Planes y suscripciones
- Valores del enunciado como **seed configurable en BD** (no constantes en código): Básico (hasta 2
  sucursales activas, sin reportes IA) y Profesional (hasta 10, con reportes IA).
- `PlanGuard` / decorador `@RequiresFeature('aiReports')` + validación de límites
  (crear/activar sucursal). Suscripción vencida o suspendida → **solo lectura** (confirmado, ver sección 8).
- Contratación/renovación **simulada** administrativamente (sin cobro real).

### 3.3 Sincronización offline (contrato común web y móvil)
- Endpoint único `POST /sync/operations` (lote) + `GET /sync/operations/:clientId` (estado).
- Cada operación: `operationId` (UUID del cliente), `type` (`SALE_CASH`, `RESERVATION`,
  `EXCHANGE`), `tenantId` (implícito por JWT, verificado), `branchId`, `userId`, `createdAtLocal`,
  `payload`, `payloadHash`.
- **Estados** en cliente y servidor: `LOCAL` → `SENDING` → `CONFIRMED` | `REJECTED` | `CONFLICT`
  (+ `RETRY` ante fallo de red). **Nunca se borra** una operación local por haber intentado enviarla.
- **Idempotencia**: `operationId` único por tenant; reenviar devuelve el mismo resultado sin duplicar.
- **Conflictos** detectados al confirmar: stock insuficiente, variante/producto inactivo, precio
  distinto al vigente, sucursal no autorizada, turno cerrado, suscripción inválida. Respuesta con
  código y detalle; la UI permite revisar/descartar/reintentar.
- **Observabilidad**: tabla `sync_log` (operación, intento, resultado, código de error, latencia),
  sin datos personales.
- Reglas de negocio de confirmación **reutilizan** los servicios existentes de ventas/reservas
  (misma transacción e integridad de inventario que online).

### 3.4 Web PWA
- Almacenamiento local en **IndexedDB** (migrar `localStorage` actual), con capas separadas:
  repositorio local, cola de operaciones, servicio de sincronización, UI.
- Catálogo descargado por sucursal (productos, variantes, precios, stock conocido) con
  **marca de tiempo** visible ("datos de hace X horas").

### 3.5 Móvil
- **`expo-sqlite`** con esquema normalizado (productos, variantes, sucursales, clientes mínimos,
  ventas+detalle, reservas+detalle, operaciones pendientes, resultados de sync) y migraciones
  versionadas.
- **Modo vendedor**: si inicia sesión `CASHIER`/`BRANCH_MANAGER`/`ADMINISTRATOR`, el móvil muestra
  un POS (catálogo local, cobro de contado, cola, sincronización). Clientes: tienda + reservas
  offline.
- Selección de tienda (tenant) para clientes.

### 3.6 Reportes generativos con IA
- Mantener el patrón seguro actual: **la IA solo produce una "intención" JSON** validada contra un
  catálogo de reportes y filtros permitidos; el backend ejecuta **consultas parametrizadas
  predefinidas** siempre restringidas al tenant y a la sucursal del usuario.
- Ampliar a ≥6 tipos: ventas agrupadas (por sucursal/categoría/canal/periodo), top N productos,
  ventas por semana (gráfico), comparación de sucursales en N meses, productos con menor
  existencia, categorías con mayores ingresos (+ los que surjan). Multi-tabla y varios filtros.
- La respuesta incluye la **especificación de visualización** (tabla/barras/líneas/torta elegida
  según el reporte) y una narrativa breve. Manejo de solicitudes ambiguas (pedir aclaración) y no
  soportadas (explicar qué sí se puede).
- Voz: Web Speech API (web); en móvil, dictado si es viable en SDK 57 (si no, documentarlo).
- Solo planes con `aiReports`.

### 3.7 Machine Learning (microservicio Python)
- Nuevo servicio **`ml-service/`**: **FastAPI + scikit-learn + pandas**, Dockerfile, `pytest`.
- Datos **sintéticos** generados por script reproducible (semilla), con forma del dominio real.
- **Supervisado**: predicción de demanda (unidades vendidas por producto/sucursal/semana) con
  regresión (p. ej. RandomForestRegressor) — métricas MAE/RMSE/R², validación cruzada.
- **No supervisado**: segmentación de clientes RFM con K-Means (silhouette) y/o detección de
  anomalías en ventas (IsolationForest).
- NestJS consume el servicio (red interna), aplica permisos y tenant; el servicio **no** accede
  libremente a la BD (recibe datos agregados o lee con usuario de solo lectura y filtro por tenant).
- **Dashboard analítico** en la web: KPIs, gráficos, predicciones, segmentos y métricas del modelo.

---

## 4. Orden de desarrollo (por qué así)

`F0 → F1 → F2 → F3 → F4 → F5 ∥ F6 → F7 → F8 → F9 → F10 → F11 → F12`

El **tenant (F2)** cambia el modelo de datos y la autorización de todo: va primero para no
reescribir lo offline y los reportes. La **sincronización en backend (F4)** define el contrato que
usan web (F5) y móvil (F6), que pueden avanzar en paralelo. IA/ML (F8–F9) consumen datos ya
aislados por tenant. ICONIX se inicia en F1 (modelo de dominio y casos de uso guían el diseño) y se
cierra en F12 con lo realmente implementado.

---

## 5. Lista de tareas

### F0 — Preparación
- [x] ~~**F0.1** Crear rama `parcial2` desde `main` y verificar que todas las pruebas actuales pasan (línea base).~~ — 2026-10-27, commit `477f3fd`
  - Línea base: backend 212 unit + **108 e2e** (con `TEST_DATABASE_URL` sobre PostgreSQL 16 local), web 167, móvil 11; `tsc` OK; oxlint solo advertencias.
- [x] ~~**F0.2** Copiar el enunciado del parcial 2 a `recursos_contexto/Examen2.md` (lo provee el usuario).~~ — 2026-10-27
- [x] ~~**F0.3** Inventario rápido de deuda que afecte al parcial (anotarla aquí como subtareas, no en archivos nuevos).~~ — 2026-10-27, commit `477f3fd`
  - D1: uniques globales que deben ser por tenant: `usuarios.email`, nombre de categoría/temporada/proveedor/talla/color, `codigo_hex`, sucursal `[ciudad, nombre]` (→ F2.2).
  - D2: `saleItem.groupBy` / `findMany` en `ai.repository.ts` y `offline-sales.service.ts` agregan sobre **todas** las filas (fuga entre empresas si no se filtra) (→ F2.5).
  - D3: 13 consultas `$queryRaw` en `reports.repository.ts`: la extensión de Prisma no las cubre; requieren `tenant_id` explícito (→ F2.11).
  - D4: jobs sin usuario (vencimiento de reservas y checkout, conciliación Stripe) y webhook de Stripe recorren todos los registros: necesitan contexto "sistema" explícito (→ F2.4/F2.11).
  - D5: el JWT no lleva tenant y las apps instaladas no envían `X-Tenant` → slug por defecto `fashionstore` (→ F2.4/F2.6).
  - D6: ventas offline web en `localStorage` (ya conocido, → F5.1).
  - D7: entorno: Node local 22.22.0 por debajo de `engines` de la CLI de Nest (solo advertencia); los e2e se saltan sin `TEST_DATABASE_URL` (documentado en `backend/docs/carrito.md`).

### F1 — ICONIX: análisis inicial (antes de codificar F2)
- [x] ~~**F1.1** Modelo de dominio actualizado (Tenant, Plan, Subscription, SyncOperation, SyncLog, Exchange, ReportRequest, MLModel…).~~ — 2026-10-27, commit `2f23c20` (`docs/ICONIX_Parcial2.md` §1–4)
- [x] ~~**F1.2** Modelo de casos de uso nuevos/modificados (actores: Admin plataforma, Admin empresa, Encargado, Cajero, Cliente, Servicio ML).~~ — 2026-10-27, commit `2f23c20` (`docs/ICONIX_Parcial2.md` §1–4)
- [x] ~~**F1.3** Descripción textual (flujo básico/alternativo) de los casos de uso críticos: registrar empresa, cambiar plan, venta offline, reserva offline, sincronizar, resolver conflicto, cambio de prenda, reporte generativo, dashboard ML.~~ — 2026-10-27, commit `2f23c20` (`docs/ICONIX_Parcial2.md` §1–4)
- [x] ~~**F1.4** Diagramas de robustez de los casos críticos.~~ — 2026-10-27, commit `2f23c20` (`docs/ICONIX_Parcial2.md` §1–4)

### F2 — Backend multitenant + planes
- [x] ~~**F2.1** Modelos Prisma `Tenant`, `Plan`, `Subscription` (+ historial) y rol `PLATFORM_ADMIN`.~~ — 2026-10-27, commit `b1c51e5` (tablas `empresas`, `planes`, `suscripciones`, `historial_suscripciones`)
- [x] ~~**F2.2** Migración: `tenantId` en todas las entidades de negocio (sección 3.1), índices `(tenantId, …)` y uniques compuestos.~~ — 2026-10-27, commit `b1c51e5` (migración `20261027000000_multitenancy`; `id_empresa` en 29 tablas; default de BD que falla si la app no fija la empresa)
- [x] ~~**F2.3** Migración de datos: todo lo existente → Empresa A (plan Profesional); verificar conteos antes/después.~~ — 2026-10-27, commit `b1c51e5` (conteos idénticos antes/después en BD local con seed base+demo; 0 usuarios sin empresa)
- [x] ~~**F2.4** Contexto de tenant por petición (JWT + `X-Tenant` para rutas públicas) con AsyncLocalStorage.~~ — 2026-10-27, commit `b1c51e5` (`TenantMiddleware` + `tenantContext`; JWT con `tenantId`; slug por defecto `DEFAULT_TENANT_SLUG`)
- [x] ~~**F2.5** Capa de aislamiento: extensión Prisma / repositorios que filtran por tenant en lecturas y escrituras; recursos ajenos → 404.~~ — 2026-10-27, commit `e186f93` (extensión Prisma + `$queryRaw` de reportes con `id_empresa`; JWT válido fija la empresa también en rutas públicas)
- [x] ~~**F2.6** Auth por tenant: login/registro con slug; email único por tenant; `PLATFORM_ADMIN` sin tenant.~~ — 2026-10-27, commit `e186f93` (`X-Tenant` en login/registro, `POST /platform/auth/login`; `PLATFORM_ADMIN` no asignable desde una empresa)
- [x] ~~**F2.7** API de plataforma: CRUD de empresas, designar administrador, asignar/cambiar plan, renovar/suspender suscripción (simulado), consultar estado.~~ — 2026-10-27, commit `e186f93` (`/platform/*`)
- [x] ~~**F2.8** API de empresa: ver plan, límites y uso (sucursales activas, etc.).~~ — 2026-10-27, commit `e186f93` (`GET /tenant/subscription`, `/tenant/public`, `/tenant/directory`)
- [x] ~~**F2.9** `PlanGuard` / `@RequiresFeature` y validación de límites (sucursales); suscripción vencida → solo lectura.~~ — 2026-10-27, commit `e186f93` (`TenantAccessInterceptor`: `@RequiresFeature` + solo lectura; límite en `BranchesService`)
- [x] ~~**F2.10** Seed de Empresa B (plan Básico) con usuarios de todos los roles, sucursales, catálogo, stock, algunas ventas y reservas.~~ — 2026-10-27, commit `e186f93` (`npm run prisma:seed:tenant-b`, incluye admin de plataforma)
- [x] ~~**F2.11** Adaptar módulos existentes (catálogo, inventario, carrito, reservas, ventas, pagos/Stripe webhook, push, reportes, IA, probador, notificaciones, jobs de vencimiento) al tenant.~~ — 2026-10-27, commit `e186f93` (automático vía extensión; ajustes explícitos: reportes raw, jobs y webhook por empresa, tokens push compartidos, uniques por empresa)
- [x] ~~**F2.12** Pruebas de aislamiento: usuario de A no puede leer/modificar/borrar recursos de B (por id, listados, reportes, sync), límites de plan, feature gating.~~ — 2026-10-27, commit `e186f93` (`test/tenancy.e2e-spec.ts`, 10 casos; el caso *sync* queda en F4.8)

### F3 — Web: SaaS
- [x] ~~**F3.1** Rutas de tienda pública por empresa `/t/:slug/...`; selector/landing de empresas; envío de `X-Tenant`.~~ — 2026-10-27, commit `0d8ee17` (`/t/:slug/...` fija la tienda activa y continúa en la ruta normal de la tienda —no se duplicaron las rutas—; `/empresas`; `X-Tenant` solo sin sesión)
- [x] ~~**F3.2** Login de personal y clientes por empresa; panel de **plataforma** (empresas, planes, suscripciones).~~ — 2026-10-27, commit `0d8ee17` (login muestra/cambia la tienda; `/plataforma` con sesión propia)
- [x] ~~**F3.3** Panel de empresa: plan actual, límites/uso, vencimiento; ocultar/deshabilitar funciones no incluidas (además del bloqueo en backend).~~ — 2026-10-27, commit `0d8ee17` (`/admin/plan`, menú según `features`, empresa y plan en el panel)
- [x] ~~**F3.4** Mensajes claros cuando una acción es bloqueada por plan o suscripción.~~ — 2026-10-27, commit `0d8ee17` (`MENSAJES_CODIGO` + `AvisoSuscripcion`; verificado con Playwright contra la API real)

### F4 — Backend: sincronización unificada
- [x] ~~**F4.1** Modelos `SyncOperation` (operationId único por tenant, tipo, estado, hash, resultado) y `SyncLog`.~~ — 2026-10-28, commit `6f2e63c` (`operaciones_sync`, `sync_log`; migración `20261028000000_sync_operations`)
- [x] ~~**F4.2** `POST /sync/operations` (lote) y `GET` de estado; idempotencia por `operationId`.~~ — 2026-10-28, commit `6f2e63c` (`POST /sync/operations`, `GET /sync/operations/:deviceId`; resultados guardados; `ERROR` transitorio queda pendiente)
- [x] ~~**F4.3** Confirmación de `SALE_CASH` reutilizando ventas/turnos; integridad transaccional con inventario y kardex.~~ — 2026-10-28, commit `6f2e63c` (`SyncSalesService` sobre `SalesRepository`: venta+pago+turno+stock+kardex en transacción serializable)
- [x] ~~**F4.4** Confirmación de `RESERVATION` offline reutilizando reservas.~~ — 2026-10-28, commit `6f2e63c` (`ReservationsService.create` con `operationKey` único por empresa)
- [x] ~~**F4.5** Detección y códigos de conflicto (stock, precio, inactivo, sucursal, turno, suscripción) con detalle útil para la UI.~~ — 2026-10-28, commit `6f2e63c` (códigos y `detail` documentados en `backend/docs/ventas-offline.md`)
- [x] ~~**F4.6** Endpoint de **descarga de datos para offline** por sucursal (catálogo + variantes + precios + stock + clientes mínimos) con versión/marca de tiempo; compatible con el lote offline actual.~~ — 2026-10-28, commit `6f2e63c` (`GET /sync/snapshot`; el flujo de lote `/sales/offline/*` se conserva)
- [x] ~~**F4.7** Observabilidad: registro en `SyncLog` sin datos sensibles; consulta para el administrador.~~ — 2026-10-28, commit `6f2e63c` (`GET /sync/logs` con resumen por estado/código; sin payload)
- [x] ~~**F4.8** Pruebas: idempotencia (reenvío no duplica), conflictos, rechazo cross-tenant, recuperación tras error.~~ — 2026-10-28, commit `6f2e63c` (`test/sync.e2e-spec.ts`, 9 casos + `sync-outcome.spec.ts`)

### F5 — Web PWA offline
- [x] ~~**F5.1** Migrar persistencia offline de `localStorage` a **IndexedDB** (capas: repositorio local / cola / sincronizador / UI), migrando tickets existentes.~~ — 2026-10-28, commit `751134b` (`src/offline/{db,repositorio,cola,sincronizador,migracion}.ts`; tickets antiguos migrados con su id y su lote; backend acepta `offlineBatchId` en `SALE_CASH`)
- [x] ~~**F5.2** Catálogo offline consultable (productos, precios, tallas, colores, stock conocido) con indicador de antigüedad de datos.~~ — 2026-10-28, commit `751134b` (`/offline`: búsqueda, categorías, precios, tallas, colores, stock conocido y aviso de antigüedad >12 h)
- [x] ~~**F5.3** Venta de contado offline usando el contrato `/sync/operations`.~~ — 2026-10-28, commit `751134b` (`/caja/offline` reescrita sobre `/sync/operations`)
- [x] ~~**F5.4** Reserva offline.~~ — 2026-10-28, commit `751134b` (reserva offline del cliente en `/offline`)
- [x] ~~**F5.5** Pantalla de operaciones pendientes con estados (`LOCAL/SENDING/CONFIRMED/REJECTED/CONFLICT`), detalle de conflictos, reintento y resolución.~~ — 2026-10-28, commit `751134b` (`/pendientes` y `/caja/pendientes`: filtros por estado, detalle de conflicto, reintentar y descartar sin borrar)
- [x] ~~**F5.6** Sincronización automática al recuperar conexión + manual; indicador global online/offline.~~ — 2026-10-28, commit `751134b` (`IndicadorConexion` en ambos layouts; auto-sync al reconectar y cada 30 s)
- [x] ~~**F5.7** Verificar instalación PWA, recarga sin red y persistencia tras cerrar el navegador.~~ — 2026-10-28, commit `751134b` (Playwright sobre build de producción con perfil persistente: SW activo + manifest, recarga sin red, cierre/reapertura del navegador, confirmación al reconectar — venta #40 y reserva #10)
- [x] ~~**F5.8** Pruebas (cola, reintentos, no-borrado, estados, idempotencia del lado cliente).~~ — 2026-10-28, commit `751134b` (`test/offline-sync.test.ts` 9 casos + `offline-ui.test.tsx` reescrita; detectaron doble registro por doble clic y orden inestable, corregidos)

### F6 — Móvil SQLite + modo vendedor
- [x] ~~**F6.1** Integrar `expo-sqlite` (según docs SDK 57) con esquema y migraciones versionadas (sección 3.5).~~ — 2026-10-28, commit `24394ab` (`expo-sqlite@~57.0.4`, etiqueta `sdk-57` del registro npm; esquema normalizado + migraciones `user_version` en `src/offline/nucleo.ts`)
  - ⚠️ `docs.expo.dev` no es accesible desde la nube (DNS bloqueado) y `expo install` falla por proxy: la API se verificó con los tipos `.d.ts` y el CHANGELOG del paquete instalado. Revisar contra la doc versionada en local.
- [x] ~~**F6.2** Descarga y almacenamiento del subconjunto del catálogo y sucursales autorizadas.~~ — 2026-10-28, commit `24394ab` (`GET /sync/snapshot` → tablas sucursales/productos/variantes/clientes/descargas)
- [x] ~~**F6.3** Consulta offline de productos, precios y existencias conocidas (con antigüedad de datos).~~ — 2026-10-28, commit `24394ab` (catálogo local con stock conocido y antigüedad)
- [x] ~~**F6.4** Selección de tienda (tenant) para clientes y envío de `X-Tenant`.~~ — 2026-10-28, commit `24394ab` (`PantallaTiendas`, `X-Tenant` sin sesión; verificado en la vista web exportada)
- [x] ~~**F6.5** Reserva offline (cliente).~~ — 2026-10-28, commit `24394ab` (`PantallaTiendaOffline`)
- [x] ~~**F6.6** **Modo vendedor**: POS de contado offline para personal (turno abierto con conexión, cobro, ticket).~~ — 2026-10-28, commit `24394ab` (`TabsVendedor`: Vender, Pendientes, Cuenta)
- [x] ~~**F6.7** Cola de sincronización (reintentos con backoff, no-borrado, estados) y pantalla de pendientes/resultados.~~ — 2026-10-28, commit `24394ab` (`PantallaPendientes`; backoff 5 s–5 min; resultados en `sync_resultados`)
- [ ] **F6.8** Persistencia tras cerrar/reiniciar la app (verificación manual + prueba).
  - ⏳ Falta: verificación manual en el teléfono con la APK nueva (F11.4). Cubierto por prueba (reapertura del archivo SQLite) y la sesión ya no se descarta al abrir sin red.
- [x] ~~**F6.9** Pruebas (`node:test`, como `test/push.test.mjs`) de la cola y el mapeo SQLite.~~ — 2026-10-28, commit `24394ab` (`test/offline-movil.test.mjs`, 7 casos sobre `node:sqlite`)

### F7 — Ventas offline y cambios de prendas
- [x] ~~**F7.1** Registro completo de venta offline (todos los campos del enunciado 7.2) en web y móvil.~~ — 2026-10-27 (web y móvil guardan UUID, empresa, sucursal, usuario, cliente, fecha local, variantes, cantidades, precios, total, pago y estado; `tenantId`/`userId` verificados por el servidor; migración SQLite v2)
- [x] ~~**F7.2** **Cambios de prendas**: plazo configurable por empresa (p. ej. 7 días), misma o distinta variante, diferencia de precio, devolución al stock y kardex; online y como operación `EXCHANGE` sincronizable.~~ — 2026-10-27 (modelo `cambios`, migración `20261029000000_exchanges`, `POST /exchanges`, `EXCHANGE` en `/sync`, `/caja/cambios` online y offline; plazo en `PATCH /tenant/settings`)
- [x] ~~**F7.3** Aporte propio adicional (proponer y anotar aquí; p. ej. devoluciones con nota de crédito o cupones).~~ — 2026-10-27 (aporte propio: **nota de crédito** por diferencia a favor del cliente, consulta y canje parcial con saldo)
- [x] ~~**F7.4** Pruebas de consistencia de inventario (venta offline + venta online concurrente, cambio de prenda).~~ — 2026-10-27 (`test/exchanges.e2e-spec.ts`: venta offline vs. online por la última unidad, dos cambios simultáneos de la misma línea, kardex y stock)

### F8 — Reportes generativos con IA
- [x] ~~**F8.1** Catálogo de reportes ampliado (≥6 tipos, sección 3.6) con consultas parametrizadas multi-tabla y filtros (fechas, sucursales, categorías, productos, canal).~~ — 2026-10-27, commit `beb7d62` (10 tipos: `sales`, `sales-grouped` por sucursal/categoría/canal/día/semana/mes, `sales-by-week`, `top-products`, `top-categories`, `branch-comparison` en N meses, `low-stock`, `inventory`, `reservations`, `cash-shifts`; `ReportsService.catalog` con `Prisma.sql` sobre ventas+detalle+productos+categorías+sucursales)
- [x] ~~**F8.2** Intérprete: IA → intención JSON validada (lista blanca); reglas de respaldo sin IA; manejo de ambiguas/incompletas/no soportadas.~~ — 2026-10-27, commit `beb7d62` (`sanitizeDecision` con ids de listas permitidas; `decideWithRules`; `NEEDS_CLARIFICATION`/`UNSUPPORTED` con sugerencias; `rejectReason` corta escrituras, datos personales, otras empresas y SQL antes del modelo)
- [x] ~~**F8.3** Respuesta con datos + especificación de gráfico elegida dinámicamente + narrativa.~~ — 2026-10-27, commit `beb7d62` (`table` tipada + `chart` de `chooseChart`: líneas/torta/barras/tabla según reporte y datos; narrativa del modelo o determinista)
- [x] ~~**F8.4** UI web: texto y voz, tabla/gráfico dinámico, exportar Excel/PDF con formato de reporte convencional.~~ — 2026-10-27, commit `beb7d62` (`GraficoDinamico` con Recharts, tabla, aclaraciones con sugerencias; exportación verificada con Playwright)
- [x] ~~**F8.5** Restricción por tenant, rol/sucursal y plan (`aiReports`).~~ — 2026-10-27, commit `beb7d62` (consultas filtran `id_empresa`; encargado limitado a su sucursal con `scopedMany`; `aiReports`; permitido en solo lectura porque solo consulta)
- [ ] **F8.6** (Opcional) Reportes IA en móvil. — no implementado en esta fase; el endpoint ya devuelve `table`/`chart` reutilizables desde la app.
- [x] ~~**F8.7** Pruebas: intención→consulta, filtros, aislamiento de tenant, rechazo de pedidos no permitidos.~~ — 2026-10-27, commit `beb7d62` (`report-intent.spec.ts` +3, `ai.e2e-spec.ts` +5 con ventas reales y otra empresa, `reporte-ia.test.tsx` 4)

### F9 — Módulo de Machine Learning
- [x] ~~**F9.1** Crear `ml-service/` (FastAPI, scikit-learn, pandas, Dockerfile, `pytest`).~~ — 2026-10-27 (`ml-service/` con requisitos fijados, Dockerfile no-root con volumen de modelos, 12 pruebas `pytest`)
- [x] ~~**F9.2** Generador de **datos sintéticos** reproducible (semilla) con forma del dominio.~~ — 2026-10-27 (`app/synthetic.py`: estacionalidad por categoría, diciembre, Día de la Madre, promociones, precio, ruido Poisson-Gamma, anomalías y perfiles de clientes; usa el catálogo real de la empresa)
- [x] ~~**F9.3** Selección de variables y preprocesamiento (documentado en el código/notebook).~~ — 2026-10-27 (`app/features.py`: rezagos, ventanas solo con pasado, calendario cíclico, precio relativo, one-hot; justificación en el docstring y en `ml-service/README.md`)
- [x] ~~**F9.4** Modelo **supervisado** (demanda) + evaluación (MAE/RMSE/R², validación cruzada).~~ — 2026-10-27 (RandomForestRegressor; `TimeSeriesSplit(5)` + prueba con 8 semanas + 2 líneas base; mejora 13–25 % el MAE en 3 semillas; intervalo 10–90 % por árboles)
- [x] ~~**F9.5** Modelo **no supervisado** (segmentación K-Means/RFM y/o anomalías) + evaluación (silhouette, etc.).~~ — 2026-10-27 (K-Means RFM con silueta, Davies-Bouldin, Calinski-Harabasz y ARI; IsolationForest con precisión/recall sobre anomalías inyectadas)
- [x] ~~**F9.6** API del servicio (entrenar, predecir, segmentos, métricas) y persistencia de modelos.~~ — 2026-10-27 (`/v1/tenants/{id}/train|metrics|forecast|segments|anomalies` con `X-Internal-Token`; joblib por empresa con escritura atómica)
- [x] ~~**F9.7** Integración NestJS ↔ ml-service con permisos, tenant y plan.~~ — 2026-10-27 (`MlModule`: `POST /ml/train` y `GET /ml/dashboard`, `mlAnalytics`, roles, encargado limitado a su sucursal, sin datos personales; `test/ml.e2e-spec.ts` 5 casos)
- [x] ~~**F9.8** Reportes inteligentes (predicciones, patrones, métricas) y **dashboard analítico** en la web.~~ — 2026-10-27 (`/admin/analitica` y `/sucursal/analitica`: predicción con banda, top productos, segmentos con acciones, semanas atípicas y evaluación; verificado con Playwright contra el stack real)
- [x] ~~**F9.9** `docker-compose` local con el nuevo servicio.~~ — 2026-10-27 (servicio `ml` sin puertos publicados y volumen `ml-models`)
  - ⏳ Falta construir la imagen en local: el entorno en la nube no tiene demonio de Docker.

### F10 — Calidad
- [ ] **F10.1** Pruebas de reglas críticas: aislamiento multitenant, límites de plan, idempotencia, conflictos, integridad de inventario, cambios de prendas.
- [ ] **F10.2** Pruebas de integración (e2e backend con BD de prueba) de los flujos SaaS y sync.
- [ ] **F10.3** Revisión de rendimiento (índices por `tenantId`, consultas de catálogo/reportes, sin descargas masivas) — justificar decisiones (RNF09).
- [ ] **F10.4** Revisión de seguridad (autorización en todos los endpoints nuevos, sin fugas de tenant en errores ni logs).

### F11 — Despliegue (hacer con Claude Code local, no desde la web)
- [ ] **F11.1** Aplicar migraciones en Azure (respaldo previo con `pg_dump`).
- [ ] **F11.2** Publicar backend y web nuevos; crear Container App de `ml-service` en `fashionstore-env` (red interna).
- [ ] **F11.3** Variables nuevas en Azure; CORS; verificación de las 2 empresas en producción.
- [ ] **F11.4** Generar APK nueva (cambios nativos por `expo-sqlite`).

### F12 — Documentación ICONIX / UML 2.5+ (coherente con lo implementado)
- [ ] **F12.1** Diagramas de secuencia de los casos críticos (derivados de los de robustez).
- [ ] **F12.2** Diagrama de clases de diseño actualizado (backend + clientes offline) y modelo de datos.
- [ ] **F12.3** Diagramas de componentes y despliegue (Azure + ml-service + clientes offline).
- [ ] **F12.4** Matriz de trazabilidad requisito → caso de uso → clases/endpoints → pruebas.
- [ ] **F12.5** Guion de demostración (2 empresas, plan bloqueando IA, venta/reserva offline, conflicto, cambio de prenda, 4+ reportes, dashboard ML).

---

## 6. Datos de demostración esperados

| Empresa | Slug | Plan | Sucursales | Uso en la demo |
|---|---|---|---|---|
| FashionStore (datos actuales) | `fashionstore` | Profesional | 12 activas | IA de reportes, ML, offline |
| Empresa B (seed nuevo) | `empresa-b` | Básico | 2 | Límite de sucursales, IA bloqueada, aislamiento |

---

## 7. Documentación permitida (no son archivos de avance)

- Este archivo (`PLAN_PARCIAL2.md`): seguimiento + bitácora.
- `docs/ICONIX_Parcial2.md`: **un solo documento** con todos los modelos ICONIX/UML (PlantUML o
  Mermaid en bloques de código) y la matriz de trazabilidad.
- Actualizar (no duplicar) los documentos técnicos existentes que cambien: `backend/docs/*.md`,
  `docs/despliegue-azure.md`, `mobile/docs/*.md`, `README` de cada paquete; `ml-service/README.md`.

---

## 8. Decisiones abiertas / riesgos

- ✅ Lenguajes/frameworks: se mantienen React (PWA) y React Native/Expo (decidido por el equipo, 2026-10-27). Justificar en RNF08.
- ⚠️ Gemini (clave actual, plan gratuito) **no tiene cuota para imágenes**; texto sí. Para reportes
  generativos alcanza; si se agota, usar reglas de respaldo u Ollama local.
- ⚠️ Suscripción Azure: **1 solo entorno de Container Apps** y sin `az acr build` (compilar
  imágenes con Docker local). El ml-service va como otra app en el mismo entorno.
- ✅ Suscripción vencida o suspendida → **solo lectura** (decidido por el equipo, 2026-10-27): se permiten consultas (GET) y el inicio de sesión; toda escritura de negocio responde 403 `SUBSCRIPTION_READ_ONLY` y la sincronización marca las operaciones como conflicto `SUBSCRIPTION_INVALID`.
- Apps instaladas actuales (APK/PWA del parcial 1) no conocen el tenant: tras F2 la Empresa A debe
  seguir funcionando para clientes antiguos (slug por defecto) hasta actualizar la APK.

---

## 9. Bitácora

| Fecha | Quién / dónde | Hecho | Pendiente / próximo paso |
|---|---|---|---|
| 2026-10-27 | Claude Code (local) | Plan creado a partir del enunciado y del estado real del repo. | Empezar F0 en Claude web. |
| 2026-10-27 | Claude Code (web) | F0–F8 completas: ICONIX §1–4, multitenancy, web SaaS, sync unificado, PWA offline (IndexedDB), móvil (expo-sqlite + modo vendedor), cambios de prendas con notas de crédito y reportes con IA (10 tipos, gráfico dinámico, aclaraciones/rechazos). Backend unit 228, e2e 138; web 191; móvil 19. Decisiones confirmadas: se mantienen React/Expo; suscripción vencida = solo lectura. | Push a GitHub bloqueado (403, falta acceso de la app de Claude) → commits solo locales en `parcial2`, PRs sin abrir. Bóveda wiki (`D:/…`) no disponible: actualizar notas de multitenancy, sync, PWA/móvil offline, cambios y reportes IA. `docs.expo.dev` inaccesible. Pendientes: F6.8 (prueba en teléfono), F8.6 opcional (IA en móvil), APK en F11.4. Siguiente: F9 (ml-service). |
