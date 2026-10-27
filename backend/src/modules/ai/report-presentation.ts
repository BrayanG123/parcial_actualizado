import type { ReportIntent } from './report-intent.js';

type Row = Record<string, unknown>;
export type ColumnFormat = 'text' | 'number' | 'money' | 'percent';
export interface ReportColumn {
  key: string;
  label: string;
  format: ColumnFormat;
}
export interface ReportTable {
  columns: ReportColumn[];
  rows: Row[];
}
/**
 * Especificacion de visualizacion independiente de la libreria: el cliente
 * dibuja `type` con `x` como eje/categoria y cada clave de `y` como serie.
 */
export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'table';
  title: string;
  x?: string;
  y: Array<{ key: string; label: string }>;
  reason: string;
}

const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? (value as Row[]) : [];
const num = (value: unknown) => (typeof value === 'number' ? value : 0);
const bs = (value: unknown) => `Bs ${num(value).toFixed(2)}`;
const col = (key: string, label: string, format: ColumnFormat = 'text') => ({
  key,
  label,
  format,
});
const METRICS = [
  col('saleCount', 'Ventas', 'number'),
  col('unitsSold', 'Unidades', 'number'),
  col('revenue', 'Ingresos (Bs)', 'money'),
];
const CHANNEL: Record<string, string> = {
  IN_STORE: 'En tienda',
  WEB: 'Web',
  MOBILE: 'Movil',
};
const RESERVATION_STATUS: Record<string, string> = {
  PENDING: 'Pendientes',
  PREPARING: 'En preparacion',
  READY: 'Listas',
  CUSTOMER_PRESENT: 'Cliente en tienda',
  COMPLETED: 'Atendidas',
  CANCELLED: 'Canceladas',
  EXPIRED: 'Vencidas',
};
const PIE_MAX = 6;

/** Normaliza cualquier reporte del catalogo a una tabla con columnas tipadas. */
export function buildTable(intent: ReportIntent, value: unknown): ReportTable {
  const result = (value ?? {}) as Row;
  const items = rows(result.items);
  switch (intent.report) {
    case 'sales':
      return {
        columns: [col('date', 'Fecha'), ...METRICS],
        rows: rows(result.daily)
          .filter((r) => r.currency === 'BOB')
          .map((r) => ({ ...r, date: r.date })),
      };
    case 'sales-grouped':
    case 'sales-by-week': {
      const total = items.reduce((s, r) => s + num(r.revenue), 0);
      const by = intent.report === 'sales-by-week' ? 'week' : intent.groupBy;
      const label =
        by === 'week'
          ? 'Semana (lunes)'
          : by === 'month'
            ? 'Mes'
            : by === 'day'
              ? 'Fecha'
              : by === 'channel'
                ? 'Canal'
                : by === 'category'
                  ? 'Categoria'
                  : 'Sucursal';
      return {
        columns: [
          col('label', label),
          ...METRICS,
          col('share', '% ingresos', 'percent'),
        ],
        rows: items.map((r) => ({
          ...r,
          label:
            by === 'channel' ? (CHANNEL[String(r.label)] ?? r.label) : r.label,
          share: total ? Math.round((1000 * num(r.revenue)) / total) / 10 : 0,
        })),
      };
    }
    case 'top-products':
      return {
        columns: [
          col('rank', '#', 'number'),
          col('productName', 'Producto'),
          col('categoryName', 'Categoria'),
          ...METRICS,
        ],
        rows: items.map((r, i) => ({ ...r, rank: i + 1 })),
      };
    case 'top-categories':
      return {
        columns: [
          col('categoryName', 'Categoria'),
          col('productCount', 'Productos', 'number'),
          ...METRICS,
          col('share', '% ingresos', 'percent'),
        ],
        rows: items,
      };
    case 'branch-comparison': {
      // Pivote: una fila por mes y una columna por sucursal.
      const branches = new Map<string, string>();
      const months = new Map<string, Row>();
      for (const r of items) {
        const key = `b${String(r.branchId)}`;
        branches.set(key, String(r.branchName ?? key));
        const row = months.get(String(r.month)) ?? { month: r.month, total: 0 };
        row[key] = num(r.revenue);
        row.total = num(row.total) + num(r.revenue);
        months.set(String(r.month), row);
      }
      for (const row of months.values())
        for (const key of branches.keys()) row[key] ??= 0;
      return {
        columns: [
          col('month', 'Mes'),
          ...[...branches].map(([key, name]) =>
            col(key, `${name} (Bs)`, 'money'),
          ),
          col('total', 'Total (Bs)', 'money'),
        ],
        rows: [...months.values()],
      };
    }
    case 'low-stock':
      return {
        columns: [
          col('productName', 'Producto'),
          col('categoryName', 'Categoria'),
          col('available', 'Disponible', 'number'),
          col('reserved', 'Reservado', 'number'),
          col('variantCount', 'Variantes', 'number'),
          col('outOfStockVariants', 'Variantes agotadas', 'number'),
        ],
        rows: items,
      };
    case 'inventory':
      return {
        columns: [
          col('productName', 'Producto'),
          col('branchName', 'Sucursal'),
          col('sizeName', 'Talla'),
          col('colorName', 'Color'),
          col('available', 'Disponible', 'number'),
          col('reserved', 'Reservado', 'number'),
          col('incoming', 'Por ingresar', 'number'),
        ],
        rows: items,
      };
    case 'reservations': {
      const byStatus = new Map<string, number>();
      for (const r of items)
        byStatus.set(
          String(r.status),
          (byStatus.get(String(r.status)) ?? 0) + num(r.count),
        );
      return {
        columns: [
          col('statusLabel', 'Estado'),
          col('count', 'Reservas', 'number'),
        ],
        rows: [...byStatus].map(([status, count]) => ({
          status,
          statusLabel: RESERVATION_STATUS[status] ?? status,
          count,
        })),
      };
    }
    case 'cash-shifts':
      return {
        columns: [
          col('registerName', 'Caja'),
          col('branchName', 'Sucursal'),
          col('shiftCount', 'Turnos', 'number'),
          col('saleCount', 'Ventas', 'number'),
          col('total', 'Cobrado (Bs)', 'money'),
          col('difference', 'Diferencia (Bs)', 'money'),
        ],
        rows: rows(result.byRegister).filter((r) => r.currency === 'BOB'),
      };
  }
}

/** Elige la visualizacion segun el tipo de reporte y la forma de los datos. */
export function chooseChart(
  intent: ReportIntent,
  table: ReportTable,
): ChartSpec {
  const label = (key: string) =>
    table.columns.find((c) => c.key === key)?.label ?? key;
  const spec = (
    type: ChartSpec['type'],
    title: string,
    x: string,
    y: string[],
    reason: string,
  ): ChartSpec => ({
    type,
    title,
    x,
    y: y.map((key) => ({ key, label: label(key) })),
    reason,
  });
  if (!table.rows.length)
    return {
      type: 'table',
      title: 'Sin datos',
      y: [],
      reason: 'No hay filas para graficar.',
    };
  const few = table.rows.length <= PIE_MAX;
  switch (intent.report) {
    case 'sales':
      return table.rows.length > 1
        ? spec(
            'line',
            'Ingresos por dia',
            'date',
            ['revenue'],
            'Serie temporal diaria.',
          )
        : spec(
            'bar',
            'Ingresos del dia',
            'date',
            ['revenue'],
            'Un solo dia con ventas.',
          );
    case 'sales-by-week':
      return spec(
        'line',
        'Ingresos por semana',
        'label',
        ['revenue'],
        'Evolucion semanal.',
      );
    case 'sales-grouped': {
      const by = intent.groupBy ?? 'branch';
      if (['day', 'week', 'month'].includes(by))
        return spec(
          'line',
          `Ingresos por ${label('label').toLowerCase()}`,
          'label',
          ['revenue'],
          'Agrupacion temporal.',
        );
      return (by === 'channel' || by === 'category') && few
        ? spec(
            'pie',
            `Participacion por ${label('label').toLowerCase()}`,
            'label',
            ['revenue'],
            'Pocas categorias de un total.',
          )
        : spec(
            'bar',
            `Ingresos por ${label('label').toLowerCase()}`,
            'label',
            ['revenue'],
            'Comparacion entre grupos.',
          );
    }
    case 'top-products':
      return spec(
        'bar',
        'Unidades vendidas',
        'productName',
        ['unitsSold'],
        'Ranking ordenado.',
      );
    case 'top-categories':
      return few
        ? spec(
            'pie',
            'Participacion en ingresos',
            'categoryName',
            ['revenue'],
            'Pocas categorias de un total.',
          )
        : spec(
            'bar',
            'Ingresos por categoria',
            'categoryName',
            ['revenue'],
            'Ranking con muchas categorias.',
          );
    case 'branch-comparison': {
      const branches = table.columns
        .filter((c) => /^b\d+$/.test(c.key))
        .map((c) => c.key);
      return table.rows.length <= 3
        ? spec(
            'bar',
            'Ingresos por sucursal y mes',
            'month',
            branches,
            'Pocos meses: barras agrupadas.',
          )
        : spec(
            'line',
            'Tendencia mensual por sucursal',
            'month',
            branches,
            'Varios meses: tendencia por sucursal.',
          );
    }
    case 'low-stock':
      return spec(
        'bar',
        'Unidades disponibles',
        'productName',
        ['available'],
        'Ranking ascendente de existencias.',
      );
    case 'reservations':
      return spec(
        'pie',
        'Reservas por estado',
        'statusLabel',
        ['count'],
        'Distribucion por estado.',
      );
    case 'cash-shifts':
      return spec(
        'bar',
        'Cobrado por caja',
        'registerName',
        ['total'],
        'Comparacion entre cajas.',
      );
    case 'inventory':
      return {
        type: 'table',
        title: 'Existencias por variante',
        y: [],
        reason: 'Detalle con muchas columnas.',
      };
  }
}

/** Narrativa sin modelo para los reportes del catalogo analitico. */
export function summarizeCatalog(
  intent: ReportIntent,
  value: unknown,
  table: ReportTable,
): string | null {
  const result = (value ?? {}) as Row;
  const period = (result.period ?? {}) as Row;
  const range = `del ${String(period.from)} al ${String(period.to)}`;
  const first = table.rows[0];
  switch (intent.report) {
    case 'sales-grouped':
    case 'sales-by-week': {
      if (!first) return `No hubo ventas completadas ${range}.`;
      const total = table.rows.reduce((s, r) => s + num(r.revenue), 0);
      const best = [...table.rows].sort(
        (a, b) => num(b.revenue) - num(a.revenue),
      )[0];
      const by = intent.report === 'sales-by-week' ? 'week' : intent.groupBy;
      const name =
        by === 'week'
          ? `la semana del ${String(best.label)}`
          : by === 'month'
            ? `el mes ${String(best.label)}`
            : by === 'day'
              ? `el ${String(best.label)}`
              : String(best.label);
      return `Ventas ${range}: ${bs(total)} en ${table.rows.length} grupos. El mayor fue ${name} con ${bs(best.revenue)} (${num(best.share)}% del total).`;
    }
    case 'top-categories':
      return first
        ? `La categoria con mayores ingresos ${range} fue ${String(first.categoryName)} con ${bs(first.revenue)} (${num(first.share)}% del total). Se muestran ${table.rows.length} categorias.`
        : `No hubo ventas por categoria ${range}.`;
    case 'branch-comparison': {
      if (!first) return `No hubo ventas para comparar sucursales ${range}.`;
      const totals = table.columns
        .filter((c) => /^b\d+$/.test(c.key))
        .map((c) => ({
          name: c.label.replace(/ \(Bs\)$/, ''),
          total: table.rows.reduce((s, r) => s + num(r[c.key]), 0),
        }))
        .sort((a, b) => b.total - a.total);
      return `Comparacion de ${totals.length} sucursales (${table.rows.length} meses con ventas ${range}): lidera ${totals[0].name} con ${bs(totals[0].total)}${totals.length > 1 ? `; la ultima es ${totals.at(-1)!.name} con ${bs(totals.at(-1)!.total)}` : ''}.`;
    }
    case 'low-stock':
      return first
        ? `El producto con menor existencia es ${String(first.productName)} con ${num(first.available)} unidades disponibles. ${outOfStock(table.rows)}`
        : 'No hay productos activos con inventario registrado.';
    default:
      return null;
  }
}

function outOfStock(items: Row[]) {
  const count = items.filter((r) => num(r.available) <= 0).length;
  return count
    ? `${count} de los ${items.length} listados no tienen stock disponible.`
    : `Ninguno de los ${items.length} listados esta agotado.`;
}
