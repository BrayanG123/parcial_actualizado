/**
 * Avisos de reservas para administradores y encargados.
 *   GET   /notifications
 *   GET   /notifications/unread-count
 *   PATCH /notifications/:id/read
 */
import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import {
  adaptarListaNotificaciones,
  filtrosNotificacionesApi,
  type ListaNotificacionesBackend,
} from '../api/notificaciones.contratos';
import type { FiltrosNotificaciones, ListaNotificaciones } from '../types/notificaciones';

export const notificacionesService = {
  async listar(filtros: FiltrosNotificaciones = {}): Promise<ListaNotificaciones> {
    // La demo local no simula avisos de sucursal.
    if (USAR_MOCKS) return { items: [], total: 0, page: 1, page_size: filtros.page_size ?? 20, no_leidas: 0 };
    return adaptarListaNotificaciones(
      await api.get<ListaNotificacionesBackend>(
        endpoints.notificaciones.lista,
        filtrosNotificacionesApi(filtros),
      ),
    );
  },
  async contador(): Promise<number> {
    if (USAR_MOCKS) return 0;
    return (await api.get<{ unreadCount: number }>(endpoints.notificaciones.noLeidas)).unreadCount;
  },
  async marcarLeida(id: number): Promise<void> {
    if (USAR_MOCKS) return;
    await api.patch(endpoints.notificaciones.leer(id));
  },
};
