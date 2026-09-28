import type { ReservaBackend } from '../src/api/reservas.contratos';
import { prenda } from './catalogo-fixtures';
export const reserva: ReservaBackend = {
  id: 50,
  clientId: 31,
  branchId: 2,
  reservedAt: '2026-09-12T12:00:00Z',
  approximateTime: '2100-09-12T18:00:00Z',
  expiresAt: '2100-09-13T04:00:00Z',
  status: 'PENDING',
  observation: null,
  branch: { id: 2, name: 'Centro', city: 'La Paz', address: 'Avenida Central' },
  client: { id: 31, userId: 12, phone: null, user: { name: 'Ana', email: 'ana@example.com' } },
  items: [
    {
      id: 51,
      reservationId: 50,
      productId: 1,
      sizeId: 9,
      colorId: 10,
      quantity: 2,
      status: 'PENDING',
      product: { id: 1, name: 'Camisa', imageUrl: null },
      size: prenda.sizes[0],
      color: prenda.colors[0],
    },
  ],
};
export const datosReserva = {
  id_sucursal: 2,
  horario_aproximado: '2100-09-12T18:00:00Z',
  observacion: 'Probar ambas prendas',
  detalles: [
    { id_producto: 1, id_talla: 9, id_color: 10, cantidad: 2 },
    { id_producto: 2, id_talla: 9, id_color: 10, cantidad: 1 },
  ],
};
