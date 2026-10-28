import { cerrarDb } from '../src/offline/db';
import type { SnapshotOffline } from '../src/offline/tipos';

export const ALCANCE = 'http://localhost:3000/api/v1|fashionstore|12';

export async function limpiarDb() {
  await cerrarDb();
  await new Promise<void>((resolve) => {
    const peticion = indexedDB.deleteDatabase('fashionstore-offline');
    peticion.onsuccess = peticion.onerror = peticion.onblocked = () => resolve();
  });
}

export function snapshot(extra: Partial<SnapshotOffline> = {}): SnapshotOffline {
  const branch = { id: 2, name: 'Centro', city: 'La Paz', address: 'Av. 1' };
  return {
    clave: `${ALCANCE}#2`,
    alcance: ALCANCE,
    branchId: 2,
    version: '2-1-1',
    generatedAt: new Date().toISOString(),
    descargadoEn: new Date().toISOString(),
    tenant: { id: 1, slug: 'fashionstore', name: 'FashionStore' },
    branch,
    branches: [branch],
    currency: 'BOB',
    openShift: { id: 7, currency: 'BOB', openedAt: new Date().toISOString(), register: { id: 1, name: 'Caja 1' } },
    variants: [
      {
        productId: 1,
        productName: 'Camisa',
        categoryId: 1,
        categoryName: 'Camisas',
        sizeId: 1,
        sizeName: 'M',
        colorId: 1,
        colorName: 'Azul',
        hexCode: '#0000FF',
        unitPrice: 100,
        discount: 20,
        netUnitPrice: 80,
        available: 3,
      },
    ],
    clients: [{ id: 31, name: 'Ana', wholesale: false }],
    ...extra,
  };
}

export const item = (quantity = 1) => ({ productId: 1, sizeId: 1, colorId: 1, quantity });
