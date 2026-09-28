import type { LoteOffline } from '../src/services/offline.service';
export function lote(): LoteOffline {
  return {
    id: '998f3e4f-3f30-499e-aec1-bd09c0ef888c',
    deviceId: 'cb99fc37-0f5d-42d7-9692-9ddf9b83ed5a',
    shiftId: 1,
    preparedAt: new Date().toISOString(),
    finishedAt: null,
    snapshot: {
      userId: 12,
      branchId: 2,
      branchName: 'Centro',
      registerName: 'Caja 1',
      currency: 'BOB',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      variants: [
        {
          productId: 1,
          sizeId: 1,
          colorId: 1,
          productName: 'Camisa',
          sizeName: 'M',
          colorName: 'Azul',
          unitPrice: 100,
          discount: 20,
          netUnitPrice: 80,
          available: 3,
        },
      ],
    },
  };
}
export function instalarLocks() {
  let chain: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, fn: () => Promise<unknown>) => {
        const result = chain.then(fn);
        chain = result.catch(() => {});
        return result;
      },
    },
  });
}
