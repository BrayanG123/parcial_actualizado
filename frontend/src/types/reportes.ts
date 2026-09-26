/**
 * Formas de lectura para dashboards. No son entidades del dominio:
 * son proyecciones que NestJS calcula sobre Venta, Inventario y Reserva
 * (GET /reports/sales, /top-products, /inventory y /reservations).
 */
import type { CanalVenta, EstadoReserva } from './domain';

/** Dias de calendario YYYY-MM-DD en America/La_Paz, ambos incluidos. */
export interface FiltroReporte {
  desde?: string;
  hasta?: string;
  id_sucursal?: number;
  canal?: CanalVenta;
}

export interface ResumenVentas {
  monto_total: number;
  cantidad_ventas: number;
  ticket_promedio: number;
  unidades_vendidas: number;
}

export interface PuntoPeriodo {
  periodo: string;
  total: number;
  cantidad: number;
}

/** Hora local de Bolivia (0-23). */
export interface PuntoHora {
  hora: number;
  total: number;
  cantidad: number;
}

export interface TotalPorSucursal {
  id_sucursal: number | null;
  sucursal: string;
  total: number;
  cantidad: number;
  unidades: number;
}

export interface TotalPorCanal {
  canal: CanalVenta;
  total: number;
  cantidad: number;
}

/** Solo ventas COMPLETED; los importes de otras monedas no se mezclan. */
export interface ReporteVentas {
  desde: string;
  hasta: string;
  moneda: string;
  otras_monedas: string[];
  resumen: ResumenVentas;
  /** Serie completa del periodo: los dias sin ventas quedan en cero. */
  diario: PuntoPeriodo[];
  /** Horario comercial con las horas sin ventas en cero. */
  por_hora: PuntoHora[];
  por_sucursal: TotalPorSucursal[];
  por_canal: TotalPorCanal[];
}

export interface TopProducto {
  moneda?: string;
  id_producto: number;
  nombre: string;
  unidades: number;
  total: number;
  ventas: number;
  posicion: number;
}

export interface ResumenInventario {
  variantes: number;
  fisico: number;
  reservado: number;
  disponible: number;
  entrante: number;
  stock_bajo: number;
  agotados: number;
}

export interface InventarioPorSucursal extends ResumenInventario {
  id_sucursal: number;
  sucursal: string;
}

export interface FilaInventarioReporte {
  id_inventario: number;
  id_sucursal: number;
  sucursal: string;
  sucursal_activa: boolean;
  id_producto: number;
  producto: string;
  producto_activo: boolean;
  talla: string;
  color: string;
  fisico: number;
  reservado: number;
  disponible: number;
  entrante: number;
  stock_bajo: boolean;
}

export interface FiltroInventarioReporte {
  id_sucursal?: number;
  umbral?: number;
  solo_stock_bajo?: boolean;
  page?: number;
  page_size?: number;
}

/** Fotografia del stock actual; los resumenes abarcan todo el filtro, no la pagina. */
export interface ReporteInventario {
  resumen: ResumenInventario;
  por_sucursal: InventarioPorSucursal[];
  items: FilaInventarioReporte[];
  page: number;
  page_size: number;
  total: number;
  paginas: number;
}

export interface ResumenCaja {
  turnos: number;
  turnos_abiertos: number;
  ventas: number;
  efectivo: number;
  tarjeta: number;
  qr: number;
  transferencia: number;
  total: number;
  /** Suma de faltantes (-) y sobrantes (+) de los turnos cerrados. */
  diferencia: number;
  turnos_con_diferencia: number;
}

export interface CajaReporte extends ResumenCaja {
  id_caja: number;
  caja: string;
  id_sucursal: number;
  sucursal: string;
}

export interface TurnoReporte {
  id_turno: number;
  caja: string;
  sucursal: string;
  cajero: string;
  apertura: string;
  cierre: string | null;
  moneda: string;
  saldo_inicial: number;
  efectivo: number;
  tarjeta: number;
  qr: number;
  transferencia: number;
  total: number;
  ventas: number;
  efectivo_esperado: number;
  efectivo_contado: number | null;
  diferencia: number | null;
}

/** Turnos abiertos en el periodo (por fecha de apertura). */
export interface ReporteCaja {
  desde: string;
  hasta: string;
  moneda: string;
  resumen: ResumenCaja;
  por_caja: CajaReporte[];
  turnos: TurnoReporte[];
}

export interface ConteoPorEstado {
  estado: EstadoReserva;
  cantidad: number;
}
