import { describe, expect, it } from 'vitest';
import {
  adaptarListaNotificaciones,
  filtrosNotificacionesApi,
} from '../src/api/notificaciones.contratos';

describe('contratos de notificaciones NestJS', () => {
  it('envia unreadOnly como texto y respeta la paginacion', () => {
    expect(filtrosNotificacionesApi({ solo_no_leidas: true, page_size: 8 })).toEqual({
      page: 1,
      limit: 8,
      unreadOnly: 'true',
      branchId: undefined,
    });
    expect(filtrosNotificacionesApi().unreadOnly).toBe('false');
  });

  it('adapta avisos, estado de reserva y lectura individual', () => {
    const lista = adaptarListaNotificaciones({
      data: [
        {
          id: 5,
          branchId: 2,
          reservationId: 41,
          unitCount: 3,
          approximateTime: '2026-09-14T15:00:00.000Z',
          createdAt: '2026-09-13T12:00:00.000Z',
          branch: { id: 2, name: 'La Paz', city: 'La Paz' },
          type: 'RESERVATION_CREATED',
          title: 'Nueva reserva #41',
          message: '3 prendas reservadas',
          reservationStatus: 'PREPARING',
          readAt: null,
          isRead: false,
        },
      ],
      unreadCount: 4,
      meta: { page: 1, limit: 8, total: 12, totalPages: 2 },
    });
    expect(lista).toMatchObject({ total: 12, page_size: 8, no_leidas: 4 });
    expect(lista.items[0]).toMatchObject({
      id_notificacion: 5,
      id_reserva: 41,
      sucursal: 'La Paz',
      estado_reserva: 'PREPARANDO',
      leida: false,
    });
  });
});
