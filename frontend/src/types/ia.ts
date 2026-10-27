import type { CanalVenta, Producto } from './domain';
import type { ConteoPorEstado, ReporteCaja, ReporteInventario, ReporteVentas, TopProducto } from './reportes';

export interface MensajeChat {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  productos?: Producto[];
  origen?: string;
  fecha: string;
}

/** POST /ai/assistant: la llamada al modelo vive en NestJS. */
export interface RespuestaAsistente {
  respuesta: string;
  productos_sugeridos: Producto[];
  /** gemini, ollama o rules cuando el proveedor no respondio. */
  origen: string;
  modelo?: string | null;
}

export interface EstadoIA {
  proveedor: 'gemini' | 'ollama' | 'none';
  modelo: string | null;
  configurado: boolean;
}

export interface InterpretacionReporteIA {
  desde: string | null;
  hasta: string | null;
  id_sucursal: number | null;
  sucursal: string | null;
  canal: CanalVenta | null;
  limite: number | null;
  solo_stock_bajo: boolean;
  umbral_stock_bajo?: number;
  /** Filtros multiples del catalogo analitico (F8). */
  sucursales?: string[];
  categorias?: string[];
  productos?: string[];
  agrupacion?: string | null;
  meses?: number | null;
  explicacion: string;
}

/** Tabla normalizada que entrega el backend para cualquier reporte del catalogo. */
export interface TablaIA {
  columnas: Array<{
    clave: string;
    titulo: string;
    formato: 'text' | 'number' | 'money' | 'percent';
  }>;
  filas: Array<Record<string, string | number | null>>;
}
/** Visualizacion elegida por el backend segun el reporte y la forma de los datos. */
export interface GraficoIA {
  tipo: 'barras' | 'lineas' | 'torta' | 'tabla';
  titulo: string;
  x: string | null;
  series: Array<{ clave: string; titulo: string }>;
  motivo: string;
}
export type ReporteCatalogo =
  | 'sales-grouped'
  | 'sales-by-week'
  | 'top-products'
  | 'top-categories'
  | 'branch-comparison'
  | 'low-stock';

interface BaseReporteIA {
  pregunta: string;
  origen: string;
  modelo: string | null;
  resumen: string;
  interpretacion: InterpretacionReporteIA;
}

/** POST /ai/reports: la IA elige un reporte permitido y NestJS lo calcula. */
export type ReporteIA = BaseReporteIA &
  (
    | { tipo: 'ventas'; ventas: ReporteVentas }
    | { tipo: 'top'; top: TopProducto[] }
    | { tipo: 'inventario'; inventario: ReporteInventario }
    | { tipo: 'reservas'; reservas: ConteoPorEstado[] }
    | { tipo: 'caja'; caja: ReporteCaja }
    | {
        tipo: 'catalogo';
        reporte: ReporteCatalogo;
        tabla: TablaIA;
        grafico: GraficoIA;
      }
    /** La solicitud era ambigua o pedia algo fuera del catalogo: no hay datos. */
    | { tipo: 'aclaracion' | 'no_soportado'; sugerencias: string[] }
  );
