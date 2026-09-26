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
  explicacion: string;
}

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
  );
