import type { RecomendacionIA } from '../types/domain';
import type { GraficoIA, ReporteCatalogo, ReporteIA, RespuestaAsistente, TablaIA } from '../types/ia';
import { adaptarProducto, type ProductoBackend } from './catalogo.contratos';
import {
  adaptarReporteCaja,
  type ReporteCajaBackend,
  adaptarReporteInventario,
  adaptarReporteVentas,
  adaptarReservasPorEstado,
  adaptarTopProductos,
  CANALES_UI,
  type ReporteInventarioBackend,
  type ReporteReservasBackend,
  type ReporteVentasBackend,
  type TopProductosBackend,
} from './reportes.contratos';

export interface EstadoIABackend {
  provider: 'gemini' | 'ollama' | 'none';
  model: string | null;
  configured: boolean;
}
export interface RespuestaAsistenteBackend {
  reply: string;
  source: string;
  model: string | null;
  products: ProductoBackend[];
}
export interface RecomendacionBackend {
  id: number | null;
  clientId: number | null;
  productId: number;
  reason: string;
  score: number;
  source: string;
  createdAt: string;
  product: ProductoBackend;
}
interface TablaIABackend {
  columns: Array<{
    key: string;
    label: string;
    format: TablaIA['columnas'][number]['formato'];
  }>;
  rows: TablaIA['filas'];
}
interface GraficoIABackend {
  type: 'bar' | 'line' | 'pie' | 'table';
  title: string;
  x?: string;
  y: Array<{ key: string; label: string }>;
  reason: string;
}
const TIPO_GRAFICO = {
  bar: 'barras',
  line: 'lineas',
  pie: 'torta',
  table: 'tabla',
} as const;

export interface ReporteIABackend {
  /** Ausente en respuestas anteriores a F8: equivale a OK. */
  status?: 'OK' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED';
  question: string;
  source: string;
  model: string | null;
  summary: string;
  suggestions?: string[];
  table?: TablaIABackend | null;
  chart?: GraficoIABackend | null;
  interpretation: null | {
    report: 'sales' | 'inventory' | 'reservations' | 'cash-shifts' | ReporteCatalogo;
    branchIds?: number[];
    branchNames?: string[];
    categoryNames?: string[];
    productNames?: string[];
    groupBy?: string;
    months?: number;
    from?: string;
    to?: string;
    branchId?: number;
    branchName: string | null;
    channel?: keyof typeof CANALES_UI;
    limit?: number;
    lowStockOnly?: boolean;
    lowStockThreshold?: number;
    explanation: string;
  };
  result: unknown;
}

/** gemini, gemini:modelo, ollama:modelo o rules. */
export function etiquetaOrigen(origen: string | undefined): string {
  if (origen?.startsWith('gemini')) return 'Gemini';
  if (origen?.startsWith('ollama')) return 'IA local (Ollama)';
  if (origen === 'mock' || origen === 'MOCK_LOCAL') return 'Demo local';
  return 'Reglas (sin IA)';
}
export const esRespuestaIA = (origen: string | undefined) =>
  Boolean(origen?.startsWith('gemini') || origen?.startsWith('ollama'));

export function adaptarRespuestaAsistente(v: RespuestaAsistenteBackend): RespuestaAsistente {
  return {
    respuesta: v.reply,
    productos_sugeridos: v.products.map(adaptarProducto),
    origen: v.source,
    modelo: v.model,
  };
}

export function adaptarRecomendacion(v: RecomendacionBackend): RecomendacionIA {
  return {
    // Los visitantes no guardan historial: se usa una clave estable por producto.
    id_recomendacion: v.id ?? -v.productId,
    id_cliente: v.clientId ?? 0,
    id_producto: v.productId,
    fecha: v.createdAt,
    motivo: v.reason,
    puntuacion: v.score,
    origen: v.source,
    producto: adaptarProducto(v.product),
  };
}

const CATALOGO: ReporteCatalogo[] = [
  'sales-grouped',
  'sales-by-week',
  'top-products',
  'top-categories',
  'branch-comparison',
  'low-stock',
];

export function adaptarTablaIA(t: TablaIABackend): TablaIA {
  return {
    columnas: t.columns.map((c) => ({
      clave: c.key,
      titulo: c.label,
      formato: c.format,
    })),
    filas: t.rows,
  };
}
export function adaptarGraficoIA(g: GraficoIABackend): GraficoIA {
  return {
    tipo: TIPO_GRAFICO[g.type] ?? 'tabla',
    titulo: g.title,
    x: g.x ?? null,
    series: g.y.map((s) => ({ clave: s.key, titulo: s.label })),
    motivo: g.reason,
  };
}

export function adaptarReporteIA(v: ReporteIABackend): ReporteIA {
  const i = v.interpretation;
  if (!i || (v.status && v.status !== 'OK'))
    return {
      pregunta: v.question,
      origen: v.source,
      modelo: v.model,
      resumen: v.summary,
      interpretacion: {
        desde: null,
        hasta: null,
        id_sucursal: null,
        sucursal: null,
        canal: null,
        limite: null,
        solo_stock_bajo: false,
        explicacion: v.summary,
      },
      tipo: v.status === 'UNSUPPORTED' ? 'no_soportado' : 'aclaracion',
      sugerencias: v.suggestions ?? [],
    };
  const base = {
    pregunta: v.question,
    origen: v.source,
    modelo: v.model,
    resumen: v.summary,
    interpretacion: {
      desde: i.from ?? null,
      hasta: i.to ?? null,
      id_sucursal: i.branchId ?? null,
      sucursal: i.branchName,
      canal: i.channel ? CANALES_UI[i.channel] : null,
      limite: i.limit ?? null,
      solo_stock_bajo: i.lowStockOnly ?? false,
      umbral_stock_bajo: i.lowStockThreshold ?? 5,
      sucursales: i.branchNames ?? [],
      categorias: i.categoryNames ?? [],
      productos: i.productNames ?? [],
      agrupacion: i.groupBy ?? null,
      meses: i.months ?? null,
      explicacion: i.explanation,
    },
  };
  if (CATALOGO.includes(i.report as ReporteCatalogo) && v.table && v.chart)
    return {
      ...base,
      tipo: 'catalogo',
      reporte: i.report as ReporteCatalogo,
      tabla: adaptarTablaIA(v.table),
      grafico: adaptarGraficoIA(v.chart),
    };
  switch (i.report) {
    case 'top-products':
      return {
        ...base,
        tipo: 'top',
        top: adaptarTopProductos(v.result as TopProductosBackend),
      };
    case 'inventory':
      return {
        ...base,
        tipo: 'inventario',
        inventario: adaptarReporteInventario(v.result as ReporteInventarioBackend),
      };
    case 'cash-shifts':
      return {
        ...base,
        tipo: 'caja',
        caja: adaptarReporteCaja(v.result as ReporteCajaBackend),
      };
    case 'reservations':
      return {
        ...base,
        tipo: 'reservas',
        reservas: adaptarReservasPorEstado(v.result as ReporteReservasBackend),
      };
    default:
      return {
        ...base,
        tipo: 'ventas',
        ventas: adaptarReporteVentas(v.result as ReporteVentasBackend),
      };
  }
}
