import type { ProductoBackend, DisponibilidadBackend } from '../src/api/catalogo.contratos';

export const prenda: ProductoBackend = {
  id: 1,
  name: 'Camisa',
  description: null,
  price: 100,
  currentPrice: 80,
  discountPercent: 20,
  promotionActive: true,
  promotionStart: '2026-09-01T00:00:00.000Z',
  promotionEnd: '2026-09-30T00:00:00.000Z',
  imageUrl: null,
  active: true,
  categoryId: 5,
  seasonId: 6,
  collectionId: 7,
  supplierId: 8,
  category: { id: 5, name: 'Camisas', description: null },
  season: {
    id: 6,
    name: 'Primavera',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-12-01T00:00:00.000Z',
    active: true,
  },
  collection: { id: 7, name: 'Urbana', description: null, seasonId: 6, active: true },
  supplier: { id: 8, name: 'Textiles' },
  sizes: [{ id: 9, name: 'M' }],
  colors: [{ id: 10, name: 'Azul', hexCode: '#0000ff' }],
  arResources: [
    {
      id: 11,
      productId: 1,
      type: 'MODEL_3D',
      url: 'https://example.com/model.glb',
      format: 'glb',
      active: true,
    },
  ],
};
export const stock: DisponibilidadBackend = {
  id: 20,
  availableQuantity: 3,
  product: { id: 1, name: 'Camisa' },
  branch: { id: 2, name: 'Centro', city: 'La Paz', active: true },
  size: prenda.sizes[0],
  color: prenda.colors[0],
};
export function pagina<T>(data: T[], page = 1, limit = 100, total = data.length) {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
