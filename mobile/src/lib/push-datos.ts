export interface DestinoPush {
  pantalla: 'DetalleCompra' | 'DetalleReserva';
  id: number;
  userId: number;
  eventId: string;
}
function entero(valor: unknown): number | null {
  if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) ? numero : null;
}
/** Lista cerrada de destinos y eventos. Nunca se navega a una URL del mensaje. */
export function destinoPush(datos: unknown): DestinoPush | null {
  if (!datos || typeof datos !== 'object') return null;
  const d = datos as Record<string, unknown>;
  const userId = entero(d.userId);
  const compra = d.tipo === 'COMPRA_CLIENTE';
  const reserva = d.tipo === 'RESERVA_CLIENTE';
  if (!userId || (!compra && !reserva)) return null;
  const id = entero(compra ? d.saleId : d.reservationId);
  const eventos = compra
    ? ['ORDER_PLACED', 'PAYMENT_CONFIRMED', 'ORDER_DELIVERED']
    : ['READY', 'CANCELLED', 'EXPIRED'];
  if (!id || typeof d.event !== 'string' || !eventos.includes(d.event)) return null;
  const eventId = (compra ? 'sale-' : 'reservation-') + id + '-' + d.event;
  if (d.eventId !== eventId) return null;
  return { pantalla: compra ? 'DetalleCompra' : 'DetalleReserva', id, userId, eventId };
}
