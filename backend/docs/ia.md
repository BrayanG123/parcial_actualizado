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
| `POST /reports` | Administrador y encargado | `{ question }` → `{ interpretation, summary, source, result }` |

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
2. El modelo recibe la fecha de hoy en Bolivia, las sucursales autorizadas y la solicitud. Devuelve **filtros JSON**, nunca SQL.
3. `sanitizeIntent` aplica una lista blanca:
   - Reporte: `sales`, `top-products`, `inventory` o `reservations`.
   - Fechas válidas de hasta 366 días.
   - Sucursal de la lista autorizada.
   - Canal `IN_STORE`, `WEB` o `MOBILE`.
   - Límites acotados.
4. `ReportsService` ejecuta la consulta con los mismos permisos que `/reports`. El encargado queda siempre en su sucursal; si pidió otra, la explicación lo indica.
5. El resumen lo redacta el modelo con las cifras del resultado. Si falla, se usa un resumen determinista.

Sin modelo, `parseIntentWithRules` entiende frases como "hoy", "ayer", "últimos N días", "esta semana", "semana pasada", "este mes", "mes pasado", canales (web, app, tienda), ciudades y "stock bajo o agotado".

Límites actuales: los reportes son por día. No hay reportes por hora, caja o turno; ampliarlos requiere nuevos filtros en `/reports`.

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
