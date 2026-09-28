/** Tipos de seleccion compartidos. Carrito, reservas y consultas de ventas usan servicios reales separados; el POS cobra mediante pos.service. */
import type { ParamsPaginacion } from '../types/api';
import type { CanalVenta, EstadoReserva, MetodoPago, TipoPago } from '../types/domain';

export interface LineaSeleccion {
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
}

export interface DatosReserva {
  id_sucursal: number;
  horario_aproximado: string;
  observacion?: string;
  detalles: LineaSeleccion[];
}

export interface DatosVenta {
  canal: CanalVenta;
  id_sucursal: number | null;
  id_cliente?: number | null;
  id_reserva?: number | null;
  detalles: LineaSeleccion[];
  pago: { metodo: MetodoPago; tipo?: TipoPago; referencia_externa?: string };
}

export interface FiltrosReserva extends ParamsPaginacion {
  id_sucursal?: number;
  estado?: EstadoReserva;
}

export interface FiltrosVenta extends ParamsPaginacion {
  id_sucursal?: number;
  canal?: CanalVenta;
  desde?: string;
  hasta?: string;
}

export { carritoService } from './carrito.service';

export { reservasService } from './reservas.service';

export { ventasService } from './ventas.service';
