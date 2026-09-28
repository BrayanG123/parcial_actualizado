/** Piezas de visualizacion compartidas por el dashboard y los reportes. */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PuntoHora, PuntoPeriodo, TotalPorSucursal } from '../../types/reportes';
import { moneda } from '../../lib/format';

const ACENTO = '#8c2f39';
const TINTA = '#4a4644';
const BORDE = '#e4dcd3';

export function TarjetaKPI({
  etiqueta,
  valor,
  detalle,
  delta,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  delta?: number;
}) {
  return (
    <article className="fs-kpi">
      <p className="fs-eyebrow">{etiqueta}</p>
      <p className="fs-kpi__valor">{valor}</p>
      {delta !== undefined && delta !== 0 && (
        <p className={`fs-kpi__delta fs-kpi__delta--${delta >= 0 ? 'sube' : 'baja'}`}>
          {delta >= 0 ? '+' : ''}
          {delta}% vs. mes anterior
        </p>
      )}
      {detalle && <p className="fs-sub">{detalle}</p>}
    </article>
  );
}

function etiquetaDia(valor: string): string {
  const d = new Date(`${valor}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function GraficoVentas({ datos }: { datos: PuntoPeriodo[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACENTO} stopOpacity={0.28} />
              <stop offset="100%" stopColor={ACENTO} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={BORDE} vertical={false} />
          <XAxis
            dataKey="periodo"
            tickFormatter={etiquetaDia}
            tick={{ fontSize: 11, fill: TINTA }}
            interval="preserveStartEnd"
            minTickGap={24}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(valor) => [moneda(Number(valor)), 'Ventas']}
            labelFormatter={(l) => `Dia ${etiquetaDia(String(l))}`}
            contentStyle={{ borderRadius: 8, border: `1px solid ${BORDE}`, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="total" stroke={ACENTO} strokeWidth={2} fill="url(#gradVentas)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoSucursales({ datos }: { datos: TotalPorSucursal[] }) {
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={BORDE} vertical={false} />
          <XAxis dataKey="sucursal" tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(valor) => [moneda(Number(valor)), 'Total']}
            contentStyle={{ borderRadius: 8, border: `1px solid ${BORDE}`, fontSize: 12 }}
          />
          <Bar dataKey="total" fill={ACENTO} radius={[6, 6, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ventas por hora local: ayuda a planificar personal de caja. */
export function GraficoHoras({ datos }: { datos: PuntoHora[] }) {
  const filas = datos.map((d) => ({ ...d, etiqueta: `${String(d.hora).padStart(2, '0')}:00` }));
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={BORDE} vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            formatter={(valor, _nombre, item) => [
              `${moneda(Number(valor))} (${(item?.payload as PuntoHora | undefined)?.cantidad ?? 0} ventas)`,
              'Ventas',
            ]}
            contentStyle={{ borderRadius: 8, border: `1px solid ${BORDE}`, fontSize: 12 }}
          />
          <Bar dataKey="total" fill={ACENTO} radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarraComparativa({
  etiqueta,
  valor,
  maximo,
  detalle,
}: {
  etiqueta: string;
  valor: number;
  maximo: number;
  detalle: string;
}) {
  const porcentaje = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <div className="fs-pila" style={{ gap: 6 }}>
      <div className="fs-fila-entre">
        <span style={{ fontSize: '0.88rem' }}>{etiqueta}</span>
        <span className="fs-sub fs-nums">{detalle}</span>
      </div>
      <div className="fs-barra-progreso">
        <span style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}
