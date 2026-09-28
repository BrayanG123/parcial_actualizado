import type { Paginado } from './api';
import type { EstadoReserva } from './domain';

/** Aviso de reserva para la sucursal; la lectura es individual por usuario. */
export interface Notificacion {
  id_notificacion: number;
  id_sucursal: number;
  sucursal: string;
  id_reserva: number;
  cantidad_prendas: number;
  horario_aproximado: string;
  fecha: string;
  titulo: string;
  mensaje: string;
  estado_reserva: EstadoReserva;
  leida: boolean;
  fecha_lectura: string | null;
}

export interface ListaNotificaciones extends Paginado<Notificacion> {
  no_leidas: number;
}

export interface FiltrosNotificaciones {
  page?: number;
  page_size?: number;
  solo_no_leidas?: boolean;
  id_sucursal?: number;
}
