import type {
  FiltrosNotificaciones,
  ListaNotificaciones,
  Notificacion,
} from '../types/notificaciones';
import { adaptarPagina, type PaginaBackend } from './contratos';
import { ESTADOS_RESERVA, type EstadoReservaBackend } from './reservas.contratos';

export interface NotificacionBackend {
  id: number;
  branchId: number;
  reservationId: number;
  unitCount: number;
  approximateTime: string;
  createdAt: string;
  branch: { id: number; name: string; city: string };
  type: 'RESERVATION_CREATED';
  title: string;
  message: string;
  reservationStatus: EstadoReservaBackend;
  readAt: string | null;
  isRead: boolean;
}
export interface ListaNotificacionesBackend extends PaginaBackend<NotificacionBackend> {
  unreadCount: number;
}

/** unreadOnly viaja como texto porque NestJS lo valida como 'true' o 'false'. */
export function filtrosNotificacionesApi(f: FiltrosNotificaciones = {}) {
  return {
    page: f.page ?? 1,
    limit: f.page_size ?? 20,
    unreadOnly: f.solo_no_leidas ? 'true' : 'false',
    branchId: f.id_sucursal || undefined,
  };
}

export function adaptarNotificacion(v: NotificacionBackend): Notificacion {
  return {
    id_notificacion: v.id,
    id_sucursal: v.branchId,
    sucursal: v.branch.name,
    id_reserva: v.reservationId,
    cantidad_prendas: v.unitCount,
    horario_aproximado: v.approximateTime,
    fecha: v.createdAt,
    titulo: v.title,
    mensaje: v.message,
    estado_reserva: ESTADOS_RESERVA[v.reservationStatus],
    leida: v.isRead,
    fecha_lectura: v.readAt,
  };
}

export function adaptarListaNotificaciones(v: ListaNotificacionesBackend): ListaNotificaciones {
  return { ...adaptarPagina(v, adaptarNotificacion), no_leidas: v.unreadCount };
}
