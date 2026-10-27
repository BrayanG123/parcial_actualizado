/** Dibuja la especificacion de grafico que elige el backend para los reportes con IA. */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatoCelda } from './formato-ia';
import type { GraficoIA, TablaIA } from '../../types/ia';

const PALETA = ['#8c2f39', '#2f6f8c', '#c58b2b', '#4f7d4a', '#6b4e8c', '#8c6b4e', '#3d3d3d'];
const BORDE = '#e4dcd3';

export function GraficoDinamico({ grafico, tabla }: { grafico: GraficoIA; tabla: TablaIA }) {
  if (grafico.tipo === 'tabla' || !grafico.x || !grafico.series.length) return null;
  const x = grafico.x;
  const formato = tabla.columnas.find((c) => c.clave === grafico.series[0]!.clave)?.formato ?? 'number';
  const valor = (v: unknown) => formatoCelda(typeof v === 'number' ? v : Number(v), formato);
  const ejes = (
    <>
      <CartesianGrid stroke={BORDE} vertical={false} />
      <XAxis dataKey={x} tick={{ fontSize: 12 }} interval="preserveStartEnd" />
      <YAxis tick={{ fontSize: 12 }} width={70} />
      <Tooltip formatter={(v) => valor(v)} />
      {grafico.series.length > 1 && <Legend />}
    </>
  );
  return (
    <figure
      className="fs-grafico-ia"
      aria-label={`Grafico: ${grafico.titulo}`}
      data-tipo={grafico.tipo}
      style={{ margin: 0 }}
    >
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          {grafico.tipo === 'torta' ? (
            <PieChart>
              <Pie data={tabla.filas} dataKey={grafico.series[0]!.clave} nameKey={x} outerRadius={110} label>
                {tabla.filas.map((_, i) => (
                  <Cell key={i} fill={PALETA[i % PALETA.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => valor(v)} />
              <Legend />
            </PieChart>
          ) : grafico.tipo === 'lineas' ? (
            <LineChart data={tabla.filas} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              {ejes}
              {grafico.series.map((s, i) => (
                <Line
                  key={s.clave}
                  type="monotone"
                  dataKey={s.clave}
                  name={s.titulo}
                  stroke={PALETA[i % PALETA.length]}
                  strokeWidth={2}
                  dot={tabla.filas.length <= 31}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={tabla.filas} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              {ejes}
              {grafico.series.map((s, i) => (
                <Bar
                  key={s.clave}
                  dataKey={s.clave}
                  name={s.titulo}
                  fill={PALETA[i % PALETA.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <figcaption className="fs-sub">{grafico.motivo}</figcaption>
    </figure>
  );
}

export function TablaDinamica({ tabla }: { tabla: TablaIA }) {
  return (
    <div className="fs-tabla-scroll">
      <table className="fs-tabla">
        <thead>
          <tr>
            {tabla.columnas.map((c) => (
              <th key={c.clave} className={c.formato === 'text' ? undefined : 'fs-tabla-num'}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, i) => (
            <tr key={i}>
              {tabla.columnas.map((c) => (
                <td key={c.clave} className={c.formato === 'text' ? undefined : 'fs-tabla-num'}>
                  {formatoCelda(f[c.clave], c.formato)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
