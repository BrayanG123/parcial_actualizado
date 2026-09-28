import type { VentaBackend } from '../src/api/ventas.contratos';
import type { CobroPOS, CotizacionPOS, ReservaPOS } from '../src/services/pos.service';

export const cobro: CobroPOS = {
  shiftId: 1,
  branchId: 2,
  clientId: 31,
  reservationId: 9,
  items: [{ productId: 1, sizeId: 1, colorId: 1, quantity: 2 }],
  expectedTotal: 160,
  paymentMethod: 'CASH',
  idempotencyKey: '79c39c8c-54ad-4844-a3d1-cbc8866a8d90',
};
export const venta: VentaBackend = {
  id: 71,
  clientId: 31,
  employeeId: 8,
  branchId: 2,
  reservationId: 9,
  soldAt: '2026-09-12T22:00:00Z',
  channel: 'IN_STORE',
  status: 'COMPLETED',
  currency: 'BOB',
  total: 160,
  client: { id: 31, user: { name: 'Ana', email: 'ana@example.test' } },
  employee: { id: 8, user: { name: 'Cajero' } },
  branch: { id: 2, name: 'Centro', city: 'La Paz', address: 'Centro' },
  items: [
    {
      id: 1,
      productId: 1,
      sizeId: 1,
      colorId: 1,
      quantity: 2,
      productName: 'Camisa original',
      sizeName: 'M',
      colorName: 'Azul',
      unitPrice: 100,
      discount: 20,
      subtotal: 160,
    },
  ],
  payments: [
    {
      id: 10,
      method: 'CASH',
      type: 'IN_STORE',
      amount: 160,
      status: 'APPROVED',
      externalReference: null,
      paidAt: '2026-09-12T22:00:00Z',
    },
  ],
};
export const reservaPOS: ReservaPOS = {
  id: 9,
  branchId: 2,
  client: { id: 31, name: 'Ana', email: 'ana@example.test', wholesale: false },
  items: [
    {
      ...cobro.items[0],
      quantity: 3,
      productName: 'Camisa original',
      sizeName: 'M',
      colorName: 'Azul',
    },
  ],
};
export const cotizacion: CotizacionPOS = {
  branchId: 2,
  clientId: 31,
  reservationId: 9,
  wholesale: false,
  currency: 'BOB',
  total: 160,
  items: [{ ...venta.items[0], netUnitPrice: 80 }],
};
