import type { RecomendacionIA } from '../types/domain';
import type { ReporteIA, RespuestaAsistente } from '../types/ia';
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
export interface ReporteIABackend {
  question: string;
  source: string;
  model: string | null;
  summary: string;
  interpretation: {
    report: 'sales' | 'top-products' | 'inventory' | 'reservations' | 'cash-shifts';
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

export function adaptarReporteIA(v: ReporteIABackend): ReporteIA {
  const i = v.interpretation;
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
      explicacion: i.explanation,
    },
  };
  switch (i.report) {
    case 'top-products':
      return { ...base, tipo: 'top', top: adaptarTopProductos(v.result as TopProductosBackend) };
    case 'inventory':
      return {
        ...base,
        tipo: 'inventario',
        inventario: adaptarReporteInventario(v.result as ReporteInventarioBackend),
      };
    case 'cash-shifts':
      return { ...base, tipo: 'caja', caja: adaptarReporteCaja(v.result as ReporteCajaBackend) };
    case 'reservations':
      return {
        ...base,
        tipo: 'reservas',
        reservas: adaptarReservasPorEstado(v.result as ReporteReservasBackend),
      };
    default:
      return { ...base, tipo: 'ventas', ventas: adaptarReporteVentas(v.result as ReporteVentasBackend) };
  }
}
