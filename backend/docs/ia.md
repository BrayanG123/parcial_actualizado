# Inteligencia artificial

El módulo `ai` cubre RF25 y el actor "Servicio de IA" del examen. Tiene tres funciones: asistente de estilo, recomendador de prendas y reportes bajo demanda por texto o voz. Todas usan datos reales de PostgreSQL. La IA interpreta y redacta, pero no inventa productos, precios ni cifras.

## Proveedores

| `AI_PROVIDER` | Uso | Configuración |
|---|---|---|
| `gemini` (predeterminado) | Gemini API | `GEMINI_API_KEY`, `GEMINI_MODEL` (por defecto `gemini-3.6-flash`) |
| `ollama` | IA local, sin salir de la red | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` (por defecto `qwen2.5:3b`) |
| `none` | Sin modelo | Solo reglas |

Las claves viven solo en `backend/.env` o en los secretos del despliegue. Nunca se envían al frontend ni aparecen en los mensajes de error: la API solo registra el código HTTP del proveedor.

Todos los proveedores implementan la interfaz `AiProvider` (`generateJson`). Si la clave falta, el proveedor tarda más de `AI_TIMEOUT_MS` o devuelve JSON inválido, cada función usa **reglas deterministas** y responde `source: "rules"`. La interfaz lo indica como "Reglas (sin IA)", para no presentar una respuesta estática como si fuera IA.

### IA local con Ollama

```powershell
docker compose --profile ia-local up -d ollama
docker compose exec ollama ollama pull qwen2.5:3b
# backend/.env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434   # http://ollama:11434 dentro de docker compose
AI_TIMEOUT_MS=60000                      # un modelo en CPU responde mas lento
```

Sirve cualquier modelo con buen soporte de español y salida JSON, por ejemplo `qwen2.5:7b` o `llama3.1:8b`.

## Rutas (`/api/v1/ai`)

| Ruta | Acceso | Descripción |
|---|---|---|
| `GET /status` | Público | Proveedor, modelo y si está configurado (sin claves) |
| `POST /assistant` | Público, con límite por IP | `{ message, history?: [{ role: 'user'\|'assistant', text }] }` → `{ reply, source, model, products }` |
| `GET /recommendations` | Público; se personaliza si hay token de cliente | `limit` (1–12), `context?`, `productId?` → `[{ id, productId, reason, score, source, product }]` |
| `POST /reports` | Administrador y encargado (plan con `aiReports`) | `{ question }` → `{ status, interpretation, summary, table, chart, suggestions?, source, result }` |

`AI_REQUESTS_PER_MINUTE` (20 por defecto) limita las solicitudes por IP y responde 429 al superarlo. En Azure la API corre con una sola réplica, así que el límite en memoria es suficiente.

## Asistente

1. Toma los productos activos con stock en sucursales activas y los ordena según las palabras del mensaje (sin tildes ni plurales).
2. Envía al modelo solo los 25 más relevantes, en JSON compacto: precio vigente, promoción, tallas y colores con stock, y sucursales.
3. El modelo devuelve `{ reply, productIds }`. Se descartan los ids que no estaban en ese contexto (inventados o sin stock) y se dejan como máximo 4.
4. Los productos se devuelven con la misma forma que `GET /products/:id`.

## Recomendaciones

Primero se calcula un puntaje explicable entre 0 y 1 con los factores del examen:

- **Historial:** compras (peso 3), reservas (2) y carrito activo (1) definen categorías, tallas y colores preferidos.
- **Talla:** hay stock en una talla que el cliente ya eligió.
- **Temporada:** la temporada está vigente.
- **Categoría y colección:** en la ficha de un producto, se sugieren complementos de la misma colección y otra categoría.
- **Disponibilidad y popularidad:** solo productos con stock; ventas de los últimos 90 días.
- **Contexto opcional:** texto libre, por ejemplo "oficina".

Las 12 mejores candidatas pasan al modelo, que las reordena y redacta el motivo usando solo esos datos. Para clientes autenticados cada resultado se guarda en `recomendaciones_ia`, con `origen` igual a `gemini:<modelo>`, `ollama:<modelo>` o `rules`. Las respuestas se cachean 10 minutos por cliente y consulta.

## Reportes por texto o voz

1. React captura texto o dictado con Web Speech API (Chrome y Edge). Si el navegador no lo admite, se puede escribir.
2. Antes de llamar al modelo, `rejectReason` descarta pedidos que nunca se atienden: escrituras (borrar, actualizar, crear), credenciales, datos personales, otras empresas o SQL escrito por el usuario → `status: "UNSUPPORTED"`.
3. El modelo recibe la fecha de hoy en Bolivia, las sucursales autorizadas, las categorías y hasta 120 productos activos de la empresa. Devuelve **una intención JSON**, nunca SQL. También puede responder `clarify` (pedido ambiguo) o `unsupported`.
4. `sanitizeDecision` / `sanitizeIntent` aplican la lista blanca:

   | Reporte | Qué calcula | Filtros |
   |---|---|---|
   | `sales` | Resumen de ventas (totales, sucursal, canal, día y hora) | período, 1 sucursal, canal |
   | `sales-grouped` | Ventas agrupadas por `branch`, `category`, `channel`, `day`, `week` o `month` | período, sucursales, categorías, productos, canal |
   | `sales-by-week` | Evolución semanal (semanas desde el lunes) | ídem |
   | `top-products` | Top N productos por unidades, con categoría | ídem + límite (1–20) |
   | `top-categories` | Categorías por ingresos y % de participación | ídem + límite |
   | `branch-comparison` | Ingresos por sucursal y mes en los últimos N meses (1–12) | meses, sucursales, categorías, productos, canal |
   | `low-stock` | Productos activos con menor existencia disponible | sucursales, categorías, productos, límite |
   | `inventory` | Stock por variante (bajo o agotado) | 1 sucursal, umbral, límite |
   | `reservations` | Reservas por estado según la fecha de la cita | período, 1 sucursal |
   | `cash-shifts` | Turnos y cajas (medios de pago y arqueo) | período, 1 sucursal |

   Fechas válidas de hasta 366 días; ids solo de las listas entregadas (máximo 10 por filtro); valores fuera de la lista se descartan.
5. `ReportsService` ejecuta consultas parametrizadas predefinidas (`Prisma.sql`, nunca texto del modelo) que unen ventas, detalle, productos, categorías y sucursales, y **siempre filtran `id_empresa`** con el contexto de la petición. El encargado queda en su sucursal (`scopedMany`); si pidió otras, la explicación lo indica. Los importes del catálogo analítico son de ventas completadas en BOB.
6. La respuesta incluye:
   - `status`: `OK`, `NEEDS_CLARIFICATION` o `UNSUPPORTED` (con `suggestions` de reportes posibles).
   - `table`: columnas tipadas (`text`, `number`, `money`, `percent`) y filas normalizadas.
   - `chart`: especificación elegida por `chooseChart` según el reporte y la forma de los datos: líneas para series temporales, torta para pocas categorías o canales (≤ 6), barras agrupadas para comparar sucursales en ≤ 3 meses y líneas si son más, barras para rankings y tabla si no hay datos.
   - `summary`: narrativa redactada por el modelo con las cifras del resultado; si falla, `summarizeCatalog` / `summarize` generan una determinista.
7. La web dibuja el gráfico con Recharts (`GraficoDinamico`), muestra la tabla y exporta a Excel/PDF con el mismo formato que los reportes convencionales (contexto + tabla).

Sin modelo, `decideWithRules` entiende frases como "hoy", "ayer", "últimos N días", "últimos N meses", "esta semana", "semana pasada", "este mes", "mes pasado", "por sucursal/categoría/canal/día/mes", "por semana", "compara las sucursales", "categorías con mayores ingresos", "menor existencia", canales (web, app, tienda), ciudades, nombres de sucursal, categorías y productos. Si no reconoce el tema pide aclaración.

Acceso: `POST /ai/reports` exige administrador o encargado y la funcionalidad `aiReports` del plan (Profesional). Con la suscripción vencida sigue disponible porque solo consulta.

Pruebas: `src/modules/ai/report-intent.spec.ts` (reglas, lista blanca, rechazos y elección de gráfico) y `test/ai.e2e-spec.ts` (consultas reales en PostgreSQL, aislamiento entre empresas, aclaración/rechazo y alcance del encargado).

Pendiente: reportes con IA en móvil (F8.6, opcional).

## Analítica con Machine Learning (`/ml`)

El backend consume el servicio interno `ml-service` (ver `ml-service/README.md`) con `ML_SERVICE_URL` y `ML_SERVICE_TOKEN`. Requiere la funcionalidad `mlAnalytics` del plan (Profesional).

| Endpoint | Roles | Descripción |
|---|---|---|
| `POST /ml/train` | Administrador | `{ source: "synthetic" \| "real" }`. Sintético: envía el catálogo de la empresa (sucursales, productos, categorías y precios) y el servicio simula 104 semanas con semilla fija. Real: envía ventas completadas agregadas por semana/producto/sucursal y compras `(id de cliente, fecha, importe)`, sin datos personales. Un entrenamiento por empresa a la vez (`ML_TRAINING_IN_PROGRESS`). Bloqueado en modo solo lectura. |
| `GET /ml/dashboard?horizon=4&branchId=` | Administrador, encargado | Métricas de los tres modelos, predicción de demanda (top 10 series con nombres de producto y sucursal), segmentos RFM y semanas atípicas. El encargado queda limitado a su sucursal. Sin modelos: `{ trained: false }`. |

La empresa siempre sale de `tenantContext` y va en la ruta del servicio (`/v1/tenants/:id/...`); las consultas `$queryRaw` de `MlRepository` filtran `id_empresa`. Errores: `ML_NOT_CONFIGURED`/`ML_UNAVAILABLE` (503), `ML_MODEL_NOT_TRAINED`/`ML_PART_NOT_TRAINED` (409), `ML_INSUFFICIENT_DATA` (422), `ML_ERROR` (502); nunca se reenvía el cuerpo crudo del servicio.

Pruebas: `test/ml.e2e-spec.ts` (servicio falso por HTTP: token interno, ruta por empresa, plan, roles, alcance del encargado, datos enviados y traducción de errores).

## Probador virtual: RA en vivo y foto con IA

**RA en vivo (sin servidor).** El móvil abre un WebView con MediaPipe Pose Landmarker, detecta hombros y cadera en cada cuadro y dibuja la foto de la prenda encima (rotada y escalada con el cuerpo). El fondo claro de la foto se quita en el teléfono. Funciona en Expo Go y no consume cuota de IA. Necesita internet la primera vez para descargar el detector (CDN de jsDelivr y Google Storage).

**Foto realista con IA (opcional).** Sobre la foto tomada, el cliente con sesión puede pedir `POST /virtual-fitting/try-on`:

```json
{ "productId": 7, "image": "<JPEG en base64 o data URI>", "mimeType": "image/jpeg" }
```

- El backend descarga la foto principal del producto y envía ambas imágenes a `GEMINI_IMAGE_MODEL` (por defecto `gemini-3.1-flash-image`). Responde `{ image, mimeType, model, productId, productName }`.
- La foto de la persona no se guarda ni se registra en logs.
- `GET /virtual-fitting/status` indica si está habilitado.
- Errores: `401` sin sesión; `404` producto inexistente; `422` si la foto del producto no es JPEG/PNG/WebP (los marcadores SVG de la semilla no sirven); `503` sin clave o **sin cuota**; `502` si el proveedor falla.
- **Cuota:** la capa gratuita de Google AI Studio tiene límite 0 para modelos de imagen. Para usar este modo hay que activar la facturación del proyecto de la clave. La RA en vivo no depende de esto.
- El cuerpo JSON admite hasta 10 MB (`main.ts`).

## Pruebas

```powershell
npm test -- src/modules/ai
```

Las pruebas cubren:

- Envío de la clave solo en cabecera y parseo de Gemini y Ollama.
- Errores HTTP, JSON inválido y respaldo con reglas.
- Descarte de productos inventados.
- Puntaje por historial, talla y colección.
- Interpretación de fechas en español y lista blanca de filtros.
- Reintento único ante 500/502/503 del proveedor (Gemini se satura de forma intermitente).
- Probador con IA: envío de ambas fotos, foto de producto no válida, cuota agotada y producto inexistente (`src/modules/virtual-fitting`).
