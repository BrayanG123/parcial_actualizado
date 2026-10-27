# ml-service — Machine Learning de FashionStore

Servicio interno en **FastAPI + scikit-learn + pandas** que entrena, por empresa (tenant):

| Modelo | Tipo | Algoritmo | Para qué |
|---|---|---|---|
| Demanda | Supervisado (regresión) | `RandomForestRegressor` | Unidades por producto, sucursal y semana de las próximas 1–12 semanas, con intervalo 10–90 % |
| Segmentos | No supervisado (clustering) | `KMeans` sobre RFM | Grupos de clientes (VIP, Regulares, En riesgo…) con acción sugerida |
| Anomalías | No supervisado | `IsolationForest` | Semanas atípicas (picos y caídas) por sucursal |

Solo lo consume el backend NestJS (`/api/v1/ml/*`) por la red interna. **No se conecta a la base de datos**: el backend le envía datos agregados de la empresa autenticada o el catálogo para generar historia sintética con esa forma.

## Uso local

```bash
cd ml-service
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q                                   # pruebas
python -m app.evaluate --seed 42            # métricas sobre datos sintéticos
python -m app.synthetic --seed 42 --out data/   # CSV reproducibles
ML_SERVICE_TOKEN=un-token-largo uvicorn app.main:app --port 8000
```

Backend (`backend/.env`): `ML_SERVICE_URL=http://localhost:8000`, `ML_SERVICE_TOKEN=<el mismo token>` y `ML_TIMEOUT_MS` (60000 por defecto). En `docker compose` el servicio se llama `ml`, no publica puertos y guarda los modelos en el volumen `ml-models`; el token sale de `ML_SERVICE_TOKEN` en el `.env` de la raíz.

## API (todas menos `/health` exigen `X-Internal-Token`)

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado y versión. |
| `POST /v1/tenants/{id}/train` | `{ source: "synthetic", catalog, seed, weeks, customers, asOf }` o `{ source: "provided", sales[], transactions[], asOf }`. Entrena los tres modelos; los que no tienen datos suficientes quedan `INSUFFICIENT_DATA` con el motivo. 422 `INSUFFICIENT_DATA` si no se pudo entrenar ninguno. |
| `GET /v1/tenants/{id}/metrics` | Fuente, fecha, filas y métricas de cada modelo. 404 `MODEL_NOT_TRAINED`. |
| `POST /v1/tenants/{id}/forecast` | `{ horizon 1–12, productIds?, branchIds?, top }` → totales semanales con intervalo y las series de mayor demanda. |
| `GET /v1/tenants/{id}/segments` | Resumen por segmento y métricas (`?assignments=true` agrega cliente → segmento). |
| `GET /v1/tenants/{id}/anomalies` | Semanas marcadas, serie reciente y métricas. |

Errores: `{ code, message }` sin eco de los datos recibidos. El backend traduce los códigos (`ML_MODEL_NOT_TRAINED`, `ML_INSUFFICIENT_DATA`, `ML_UNAVAILABLE`, `ML_ERROR`) y nunca reenvía el cuerpo crudo.

## Seguridad y aislamiento

- La empresa va en la ruta y la fija NestJS desde el JWT (`tenantContext`); el cliente final nunca la elige. Cada empresa tiene su propio archivo `models/tenant-<id>/bundle.joblib` (escritura atómica).
- Token interno comparado en tiempo constante; sin token configurado el servicio responde 503.
- El backend exige `mlAnalytics` en el plan (solo Profesional), rol administrador para entrenar y administrador o encargado para consultar; el encargado solo ve su sucursal.
- Con datos reales se envían solo agregados semanales por producto/sucursal y compras como `(id interno de cliente, fecha, importe)`: sin nombres, correos ni teléfonos.
- Límites de entrada: 300 000 filas por tabla, 5 000 series producto-sucursal, horizonte ≤ 12.

## Datos sintéticos (`app/synthetic.py`)

Reproducibles por semilla (se usa `crc32`, no `hash()`, que cambia entre procesos). La demanda semanal combina popularidad del producto, tamaño de la sucursal, estacionalidad por categoría (chaquetas en el invierno boliviano), picos de diciembre y del Día de la Madre, promociones (8 % de las semanas, 10–30 %), elasticidad al precio, tendencia y ruido Poisson-Gamma. Se inyectan semanas anómalas (×2,8–3,5 o ×0,1–0,25) para evaluar la detección. Los clientes tienen perfiles latentes (VIP 5 %, Leales 20 %, Regulares 35 %, Ocasionales 25 %, Perdidos 15 %). Simplificación: las compras de clientes se generan aparte de la demanda por producto, porque cada modelo usa una sola tabla.

Con `source: "synthetic"` el backend envía el catálogo real de la empresa (sucursales, productos, categorías y precios), así las predicciones nombran productos reales aunque la historia sea simulada; la web lo advierte.

## Preprocesamiento y selección de variables (`app/features.py`)

Objetivo: unidades por producto, sucursal y semana. Se completan con 0 las semanas sin ventas. Variables: rezagos de 1, 2 y 4 semanas, media y desvío de 4 semanas, media de 12 semanas, semana del año cíclica (seno/coseno), diciembre, Día de la Madre, descuento, precio relativo a la mediana de la categoría y, en one-hot, categoría y sucursal. Se descarta el id de producto (alta cardinalidad) y cualquier dato de la misma semana salvo precio y descuento. Las ventanas usan solo semanas pasadas. `VarianceThreshold` quita variables constantes. Segmentación: `log1p` + `StandardScaler` sobre recencia, frecuencia y monto. Anomalías: cociente frente a la mediana de 8 semanas previas (y su logaritmo) más la estacionalidad.

## Evaluación (datos sintéticos, 104 semanas, 25 productos × 3 sucursales, 400 clientes)

Salida de `python -m app.evaluate --seed N`:

| Semilla | CV MAE (±σ) | CV R² | Prueba final MAE / R² | Línea base: semana anterior | Línea base: media 4 sem. | k | Silueta | Davies-Bouldin | ARI | Anomalías (inyectadas · precisión · recall) |
|---|---|---|---|---|---|---|---|---|---|---|
| 42 | 3,96 (±0,15) | 0,42 | 4,03 / 0,38 | 4,84 | 4,20 | 3 | 0,414 | 0,878 | 0,56 | 3 · 1,0 · 1,0 |
| 7 | 4,19 (±0,51) | 0,20 | 4,00 / 0,25 | 5,34 | 4,39 | 3 | 0,413 | 0,850 | 0,62 | 7 · 1,0 · 1,0 |
| 3 | 3,37 (±0,23) | 0,48 | 3,58 / 0,40 | 4,67 | 3,79 | 3 | 0,390 | 0,893 | 0,50 | 5 · 1,0 · 1,0 |

- **Demanda.** Validación `TimeSeriesSplit(5)` (siempre se entrena con el pasado) y prueba final con las últimas 8 semanas. El bosque mejora a ambas líneas base en las tres semillas (13–25 % menos MAE que repetir la semana anterior). El R² moderado refleja el techo que impone el ruido sobredisperso semanal y las semanas anómalas inyectadas. Con menos de ~80 semanas de historia el modelo queda parejo con la media de 4 semanas; por eso las métricas incluyen `beatsBaselines` y el dashboard lo muestra. Variables más importantes: media de 12 y de 4 semanas.
- **Segmentación.** La silueta máxima suele darse con k = 2 (activos/inactivos), que no sirve para acciones comerciales. Regla adoptada: entre k = 3..6, el menor k con silueta a ≤ 0,02 de la mejor. Con ella el ARI frente a los perfiles simulados sube de ~0,26 (k = 2) a 0,50–0,62.
- **Anomalías.** IsolationForest (`contamination` 0,03) más un umbral de negocio: la semana debe al menos duplicar o caer a la mitad de la mediana reciente. Sin el umbral, los picos de diciembre (~1,7×) daban falsos positivos (precisión 0,33 con la semilla 42). Límite: las anomalías inyectadas son marcadas, por eso la detección es perfecta; con datos reales la precisión será menor.

## Datos reales

`source: "real"` en el backend usa las ventas completadas de la empresa (hasta 156 semanas). El modelo de demanda necesita al menos 200 filas con 12 semanas de historia y 18 semanas distintas; la segmentación, 20 clientes con compras; las anomalías, 20 semanas por sucursal. Con la base de demostración actual (pocas ventas) no alcanza y se informa `INSUFFICIENT_DATA` por modelo.

## Pendiente

- Construir y probar la imagen Docker en local (en el entorno de desarrollo en la nube no hay demonio de Docker) y desplegarla en Azure Container Apps con ingreso interno (F11.2).
