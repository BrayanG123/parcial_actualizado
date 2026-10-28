/** Dashboard analitico con Machine Learning (F9.8): predicciones, segmentos, anomalias y metricas. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorEstado, Vacio } from '../../components/ui/Estados';
import { useAuth } from '../../context/AuthContext';
import { fecha, moneda } from '../../lib/format';
import { analiticaService, type DashboardML, type MetricasDemanda } from '../../services/analitica.service';
import { RolNombre } from '../../types/domain';
import { TarjetaKPI } from '../reports/componentes';

const PALETA = ['#8c2f39', '#2f6f8c', '#c58b2b', '#4f7d4a', '#6b4e8c', '#8c6b4e'];
const BORDE = '#e4dcd3';
const NOMBRE_VARIABLE: Record<string, string> = {
  lag_1: 'Ventas semana anterior',
  lag_2: 'Ventas hace 2 semanas',
  lag_4: 'Ventas hace 4 semanas',
  roll_mean_4: 'Promedio 4 semanas',
  roll_std_4: 'Variabilidad 4 semanas',
  roll_mean_12: 'Promedio 12 semanas',
  woy_sin: 'Estacionalidad (seno)',
  woy_cos: 'Estacionalidad (coseno)',
  is_december: 'Diciembre',
  is_mothers_day: 'Dia de la Madre',
  discount: 'Descuento',
  price_rel: 'Precio relativo',
};
const nombreVariable = (v: string) =>
  NOMBRE_VARIABLE[v] ?? v.replace(/^categoryId_/, 'Categoria #').replace(/^branchId_/, 'Sucursal #');
const semana = (v: string) => fecha(v);
const n1 = (v: number) => v.toLocaleString('es-BO', { maximumFractionDigits: 1 });

export default function PaginaAnalitica() {
  const { tieneRol } = useAuth();
  const esAdmin = tieneRol(RolNombre.ADMINISTRADOR);
  const [horizonte, setHorizonte] = useState(4);
  const qc = useQueryClient();
  const datos = useQuery({
    queryKey: ['ml-dashboard', horizonte],
    queryFn: () => analiticaService.dashboard(horizonte),
  });
  const entrenar = useMutation({
    mutationFn: analiticaService.entrenar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ml-dashboard'] }),
  });

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Machine Learning</p>
          <h1>Analitica predictiva</h1>
          <p className="fs-sub">
            Demanda de las proximas semanas, segmentos de clientes y semanas atipicas. Los modelos se entrenan por
            empresa en un servicio interno; los datos nunca se mezclan entre empresas.
          </p>
        </div>
      </header>

      {esAdmin && (
        <section className="fs-tarjeta fs-tarjeta--pad">
          <div className="fs-fila-wrap" style={{ alignItems: 'center' }}>
            <strong>Entrenar modelos</strong>
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={entrenar.isPending}
              onClick={() => entrenar.mutate('synthetic')}
            >
              {entrenar.isPending && entrenar.variables === 'synthetic' ? 'Entrenando...' : 'Con datos sinteticos'}
            </button>
            <button
              type="button"
              className="fs-btn fs-btn--contorno"
              disabled={entrenar.isPending}
              onClick={() => entrenar.mutate('real')}
            >
              {entrenar.isPending && entrenar.variables === 'real' ? 'Entrenando...' : 'Con ventas reales'}
            </button>
          </div>
          <p className="fs-campo-ayuda">
            Sinteticos: dos anos de historia simulada (semilla fija) con los productos, categorias, precios y sucursales
            de tu empresa. Reales: tus ventas completadas; si no alcanzan, se informa que modelo no pudo entrenarse.
          </p>
          {entrenar.isError && <p className="fs-campo-error">{(entrenar.error as Error).message}</p>}
          {entrenar.data && (
            <p className="fs-sub" role="status">
              Entrenamiento terminado:{' '}
              {Object.entries(entrenar.data.parts)
                .map(([k, v]) => `${PARTE[k] ?? k} ${v.status === 'TRAINED' ? 'listo' : 'sin datos suficientes'}`)
                .join(', ')}
              .
            </p>
          )}
        </section>
      )}

      {datos.isLoading && <p className="fs-sub">Cargando analitica...</p>}
      {datos.isError && <ErrorEstado error={datos.error} onReintentar={() => datos.refetch()} />}
      {datos.data && !datos.data.trained && (
        <Vacio
          titulo="Sin modelos entrenados"
          mensaje={
            esAdmin
              ? 'Entrena los modelos para ver predicciones, segmentos y anomalias.'
              : 'Pide al administrador que entrene los modelos de la empresa.'
          }
        />
      )}
      {datos.data?.trained && <Tablero d={datos.data} horizonte={horizonte} onHorizonte={setHorizonte} />}
    </>
  );
}

const PARTE: Record<string, string> = { demand: 'demanda', segmentation: 'segmentacion', anomalies: 'anomalias' };

function Tablero({
  d,
  horizonte,
  onHorizonte,
}: {
  d: Extract<DashboardML, { trained: true }>;
  horizonte: number;
  onHorizonte: (h: number) => void;
}) {
  const demanda = d.model.parts.demand.metrics as MetricasDemanda | undefined;
  const totalPredicho = d.forecast?.totals.reduce((s, t) => s + t.units, 0) ?? 0;
  return (
    <>
      <div className={`fs-alerta ${d.model.source === 'synthetic' ? 'fs-alerta--info' : ''}`}>
        <span>
          {d.model.source === 'synthetic'
            ? 'Modelos entrenados con datos sinteticos (catalogo real, historia simulada): sirven para demostrar el metodo, no para decidir compras.'
            : 'Modelos entrenados con las ventas reales de la empresa.'}{' '}
          Entrenado el {fecha(d.model.trainedAt)}
          {d.scope ? ` · Vista limitada a ${d.scope.join(', ')}` : ''}.
        </span>
      </div>

      <section className="fs-kpis">
        <TarjetaKPI
          etiqueta={`Demanda prevista (${horizonte} sem.)`}
          valor={`${n1(totalPredicho)} u`}
          detalle={d.forecast ? `${d.forecast.series} series producto-sucursal` : 'Sin modelo de demanda'}
        />
        <TarjetaKPI
          etiqueta="Error medio (MAE)"
          valor={demanda ? `${n1(demanda.holdout.mae)} u` : '—'}
          detalle={
            demanda
              ? `R² ${demanda.holdout.r2} · ${demanda.beatsBaselines ? 'mejor que las lineas base' : 'no supera a las lineas base'}`
              : undefined
          }
        />
        <TarjetaKPI
          etiqueta="Segmentos de clientes"
          valor={d.segments ? String(d.segments.metrics.chosenK) : '—'}
          detalle={d.segments ? `silueta ${d.segments.metrics.silhouette}` : 'Sin segmentacion'}
        />
        <TarjetaKPI
          etiqueta="Semanas atipicas"
          valor={d.anomalies ? String(d.anomalies.flagged.length) : '—'}
          detalle={d.anomalies ? `de ${d.anomalies.metrics.weeks} semanas evaluadas` : 'Sin deteccion'}
        />
      </section>

      {d.forecast ? (
        <Prediccion f={d.forecast} horizonte={horizonte} onHorizonte={onHorizonte} />
      ) : (
        <SinParte nombre="demanda" p={d.model.parts.demand} />
      )}
      {d.segments ? <Segmentos s={d.segments} /> : <SinParte nombre="segmentacion" p={d.model.parts.segmentation} />}
      {d.anomalies ? <Anomalias a={d.anomalies} /> : <SinParte nombre="anomalias" p={d.model.parts.anomalies} />}
      {demanda && <EvaluacionDemanda m={demanda} />}
    </>
  );
}

function SinParte({ nombre, p }: { nombre: string; p: { message?: string } }) {
  return (
    <section className="fs-panel">
      <h3>Modelo de {nombre}</h3>
      <p className="fs-sub">{p.message ?? 'No entrenado.'}</p>
    </section>
  );
}

function Prediccion({
  f,
  horizonte,
  onHorizonte,
}: {
  f: NonNullable<Extract<DashboardML, { trained: true }>['forecast']>;
  horizonte: number;
  onHorizonte: (h: number) => void;
}) {
  const datos = f.totals.map((t) => ({ ...t, banda: [t.low, t.high] }));
  return (
    <section className="fs-panel">
      <div className="fs-fila-entre fs-fila-wrap">
        <h3>Prediccion de demanda (unidades por semana)</h3>
        <label className="fs-fila-wrap" style={{ alignItems: 'center' }}>
          <span className="fs-sub">Horizonte</span>
          <select className="fs-input" value={horizonte} onChange={(e) => onHorizonte(Number(e.target.value))}>
            {[2, 4, 8, 12].map((h) => (
              <option key={h} value={h}>
                {h} semanas
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="fs-sub">
        Ultima semana observada: {semana(f.lastObservedWeek)}. Banda: {f.interval}.
      </p>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <ComposedChart data={datos} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={BORDE} vertical={false} />
            <XAxis dataKey="week" tickFormatter={semana} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={60} />
            <Tooltip
              labelFormatter={(v) => `Semana del ${semana(String(v))}`}
              formatter={(v) => (Array.isArray(v) ? v.map((x) => n1(Number(x))).join(' – ') : n1(Number(v)))}
            />
            <Area
              isAnimationActive={false}
              dataKey="banda"
              name="Intervalo 10-90 %"
              stroke="none"
              fill={PALETA[1]}
              fillOpacity={0.18}
            />
            <Line isAnimationActive={false} dataKey="units" name="Prediccion" stroke={PALETA[0]} strokeWidth={2} />
            <Legend />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <h4 style={{ marginTop: 16 }}>Productos con mayor demanda prevista</h4>
      <div className="fs-tabla-scroll">
        <table className="fs-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoria</th>
              <th>Sucursal</th>
              <th className="fs-tabla-num">Unidades ({horizonte} sem.)</th>
              <th className="fs-tabla-num">Proxima semana</th>
            </tr>
          </thead>
          <tbody>
            {f.top.map((s) => (
              <tr key={`${s.productId}-${s.branchId}`}>
                <td>{s.productName}</td>
                <td>{s.categoryName ?? '—'}</td>
                <td>{s.branchName}</td>
                <td className="fs-tabla-num">{n1(s.units)}</td>
                <td className="fs-tabla-num">
                  {s.weeks[0] ? `${n1(s.weeks[0].units)} (${n1(s.weeks[0].low)}–${n1(s.weeks[0].high)})` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Segmentos({ s }: { s: NonNullable<Extract<DashboardML, { trained: true }>['segments']> }) {
  return (
    <section className="fs-panel">
      <h3>Segmentos de clientes (RFM + K-Means)</h3>
      <p className="fs-sub">
        {s.metrics.customers} clientes · k = {s.metrics.chosenK} ({s.metrics.selectionRule}) · silueta{' '}
        {s.metrics.silhouette} · Davies-Bouldin {s.metrics.daviesBouldin}
        {s.metrics.adjustedRandVsProfiles !== undefined
          ? ` · ARI vs. perfiles simulados ${s.metrics.adjustedRandVsProfiles}`
          : ''}
      </p>
      <div className="fs-pila">
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                isAnimationActive={false}
                data={s.summary}
                dataKey="customers"
                nameKey="segment"
                outerRadius={90}
                label
              >
                {s.summary.map((_, i) => (
                  <Cell key={i} fill={PALETA[i % PALETA.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="fs-tabla-scroll">
          <table className="fs-tabla">
            <thead>
              <tr>
                <th>Segmento</th>
                <th className="fs-tabla-num">Clientes</th>
                <th className="fs-tabla-num">Recencia (dias)</th>
                <th className="fs-tabla-num">Compras</th>
                <th className="fs-tabla-num">Monto medio</th>
              </tr>
            </thead>
            <tbody>
              {s.summary.map((g) => (
                <tr key={g.segment}>
                  <td>
                    <strong>{g.segment}</strong>
                    <div className="fs-sub">{g.action}</div>
                  </td>
                  <td className="fs-tabla-num">{g.customers}</td>
                  <td className="fs-tabla-num">{n1(g.avgRecencyDays)}</td>
                  <td className="fs-tabla-num">{n1(g.avgFrequency)}</td>
                  <td className="fs-tabla-num">{moneda(g.avgMonetary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Anomalias({ a }: { a: NonNullable<Extract<DashboardML, { trained: true }>['anomalies']> }) {
  return (
    <section className="fs-panel">
      <h3>Semanas atipicas por sucursal (IsolationForest)</h3>
      <p className="fs-sub">
        Se marcan semanas que el modelo aisla y que al menos duplican o caen a la mitad de la mediana de las 8 semanas
        previas.
        {a.metrics.precision !== undefined
          ? ` Contra las anomalias simuladas: precision ${a.metrics.precision}, exhaustividad ${a.metrics.recall}.`
          : ''}
      </p>
      {a.flagged.length === 0 ? (
        <p className="fs-sub">No se detectaron semanas atipicas.</p>
      ) : (
        <div className="fs-tabla-scroll">
          <table className="fs-tabla">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Sucursal</th>
                <th>Tipo</th>
                <th className="fs-tabla-num">Unidades</th>
                <th className="fs-tabla-num">Esperado</th>
              </tr>
            </thead>
            <tbody>
              {[...a.flagged]
                .sort((x, y) => y.week.localeCompare(x.week))
                .map((f) => (
                  <tr key={`${f.branchId}-${f.week}`}>
                    <td>{semana(f.week)}</td>
                    <td>{f.branchName}</td>
                    <td>
                      <span className={`fs-badge ${f.kind === 'spike' ? 'fs-badge--info' : ''}`}>
                        {f.kind === 'spike' ? 'Pico' : 'Caida'}
                      </span>
                    </td>
                    <td className="fs-tabla-num">{n1(f.units)}</td>
                    <td className="fs-tabla-num">{n1(f.expected)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EvaluacionDemanda({ m }: { m: MetricasDemanda }) {
  const comparacion = [
    { modelo: 'Bosque aleatorio', mae: m.holdout.mae },
    { modelo: 'Promedio 4 semanas', mae: m.baselines.mean4Weeks.mae },
    { modelo: 'Semana anterior', mae: m.baselines.lastWeek.mae },
  ];
  const importancia = m.featureImportance.slice(0, 8).map((f) => ({ ...f, nombre: nombreVariable(f.feature) }));
  return (
    <section className="fs-panel">
      <h3>Evaluacion del modelo de demanda</h3>
      <p className="fs-sub">
        RandomForestRegressor · {m.rows.toLocaleString('es-BO')} filas, {m.series} series, {m.weeks} semanas. Validacion
        cruzada temporal ({m.crossValidation.method}): MAE {m.crossValidation.mean.mae} ± {m.crossValidation.std.mae},
        RMSE {m.crossValidation.mean.rmse}, R² {m.crossValidation.mean.r2} ± {m.crossValidation.std.r2}. Prueba final
        con las ultimas {m.holdout.weeks} semanas.
      </p>
      <div className="fs-rejilla-2">
        <article>
          <h4>MAE en la prueba final (menor es mejor)</h4>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={comparacion} layout="vertical" margin={{ left: 30, right: 16 }}>
                <CartesianGrid stroke={BORDE} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="modelo" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="mae" name="MAE">
                  {comparacion.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? PALETA[0] : '#b9b2ab'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article>
          <h4>Variables mas importantes</h4>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={importancia} layout="vertical" margin={{ left: 30, right: 16 }}>
                <CartesianGrid stroke={BORDE} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="nombre" width={150} interval={0} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="importance" name="Importancia" fill={PALETA[1]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
      <div className="fs-tabla-scroll">
        <table className="fs-tabla">
          <thead>
            <tr>
              <th>Particion</th>
              <th className="fs-tabla-num">Filas entrenamiento</th>
              <th className="fs-tabla-num">Filas validacion</th>
              <th className="fs-tabla-num">MAE</th>
              <th className="fs-tabla-num">RMSE</th>
              <th className="fs-tabla-num">R²</th>
            </tr>
          </thead>
          <tbody>
            {m.crossValidation.folds.map((f) => (
              <tr key={f.fold}>
                <td>{f.fold}</td>
                <td className="fs-tabla-num">{f.trainRows}</td>
                <td className="fs-tabla-num">{f.testRows}</td>
                <td className="fs-tabla-num">{f.mae}</td>
                <td className="fs-tabla-num">{f.rmse}</td>
                <td className="fs-tabla-num">{f.r2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
