import type { InventarioBackend, MovimientoBackend } from '../src/api/inventario.contratos';
import type { CarritoBackend } from '../src/api/carrito.contratos';
import { prenda } from './catalogo-fixtures';
export const inventario: InventarioBackend = {
  id: 20,
  physicalQuantity: 5,
  reservedQuantity: 2,
  availableQuantity: 3,
  updatedAt: '2026-09-12T12:00:00Z',
  branch: { id: 2, name: 'Centro', city: 'La Paz', active: true },
  product: { id: 1, name: 'Camisa', imageUrl: null, active: true },
  size: prenda.sizes[0],
  color: prenda.colors[0],
};
export const movimiento: MovimientoBackend = {
  id: 50,
  inventoryId: 20,
  employeeId: null,
  type: 'PENDING_ENTRY',
  quantity: 4,
  status: 'PENDING',
  occurredAt: '2026-09-12T12:00:00Z',
  scheduledAt: '2100-09-12T12:00:00Z',
  reference: 'OC-50',
  observation: null,
};
export const carrito: CarritoBackend = {
  id: 30,
  status: 'ACTIVE',
  createdAt: '2026-09-12T12:00:00Z',
  updatedAt: '2026-09-12T12:00:00Z',
  itemCount: 1,
  totalQuantity: 2,
  total: 160,
  hasAvailability: true,
  availableBranches: [inventario.branch],
  items: [
    {
      id: 31,
      productId: 1,
      sizeId: 9,
      colorId: 10,
      quantity: 2,
      unitPrice: 80,
      storedUnitPrice: 100,
      priceChanged: true,
      promotionActive: true,
      subtotal: 160,
      available: true,
      product: inventario.product,
      size: inventario.size,
      color: inventario.color,
      availability: [{ branch: inventario.branch, availableQuantity: 3 }],
      issue: null,
    },
  ],
};
