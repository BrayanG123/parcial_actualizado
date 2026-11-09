import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ProveedorAuth } from '../src/context/AuthContext';
import PaginaBitacoraSync, { describirDetalle } from '../src/features/offline/PaginaBitacoraSync';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { respuesta, usuarioBackend } from './fixtures';

let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let pedidos: Array<Record<string, unknown>>;
let admin: boolean;

const entrada = (id: number, status: string, errorCode: string | null, extra: object = {}) => ({
  id,
  attempt: 1,
  status,
  errorCode,
  latencyMs: 42,
  createdAt: '2026-11-09T14:00:00Z',
  syncOperation: {
    operationId: `0000000${id}-aaaa-4bbb-8ccc-dddddddddddd`,
    type: 'SALE_CASH',
    branchId: 2,
    deviceId: 'eeeeeeee-1111-4222-8333-444444444444',
    userId: 5,
    userName: 'Carla Mendoza',
    status,
    createdAtLocal: '2026-11-09T13:55:00Z',
    attempts: 1,
    resultCode: errorCode,
    resultMessage: null,
    resultDetail: null,
    resourceType: status === 'CONFIRMED' ? 'SALE' : null,
    resourceId: status === 'CONFIRMED' ? 71 : null,
    ...extra,
  },
});

beforeEach(() => {
  guardarToken('jwt-encargado');
  pedidos = [];
  admin = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  instancia.defaults.adapter = async (c) => {
    if (c.url === '/auth/me')
      return respuesta(c, {
        ...usuarioBackend,
        roles: [{ role: { id: 1, name: admin ? 'ADMINISTRATOR' : 'BRANCH_MANAGER', description: null } }],
        client: null,
      });
    if (c.url === '/branches') return respuesta(c, { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    expect(c.url).toBe('/sync/logs');
    pedidos.push(c.params);
    return respuesta(c, {
      data: [
        entrada(1, 'CONFIRMED', null),
        entrada(2, 'CONFLICT', 'STOCK_INSUFFICIENT', {
          resultDetail: { variants: [{ productId: 3, sizeId: 1, colorId: 2, requested: 1, available: 0 }] },
        }),
      ],
      summary: [
        { status: 'CONFIRMED', code: null, count: 7 },
        { status: 'CONFLICT', code: 'STOCK_INSUFFICIENT', count: 2 },
      ],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
});
async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}
async function montar() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <MemoryRouter>
            <PaginaBitacoraSync />
          </MemoryRouter>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  await esperar();
  await esperar();
}

it('muestra el resumen, cada intento y el detalle del conflicto sin datos de la venta', async () => {
  await montar();
  const texto = container.textContent ?? '';
  expect(texto).toContain('Bitacora de sincronizacion');
  expect(texto).toContain('Solo tu sucursal.');
  expect(texto).toContain('7Confirmadas');
  expect(texto).toContain('2En conflicto');
  expect(texto).toContain('Carla Mendoza');
  expect(texto).toContain('STOCK_INSUFFICIENT');
  expect(texto).toContain('42 ms');
  const detalle = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Detalle')[1]!;
  await act(async () => detalle.click());
  expect(container.textContent).toContain('se pidieron 1, habia 0 disponibles');
  expect(container.textContent).toContain('otra caja o la tienda online las vendio');
});

it('filtra por resultado desde el resumen y vuelve a la primera pagina', async () => {
  await montar();
  const conflicto = [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('2En conflicto'))!;
  await act(async () => conflicto.click());
  await esperar();
  expect(pedidos.at(-1)).toMatchObject({ status: 'CONFLICT', page: 1 });
  expect(pedidos.at(-1)).not.toHaveProperty('branchId');
});

it('describe conflictos de precio y de cupo offline', () => {
  expect(
    describirDetalle({ variants: [{ productId: 1, sizeId: 2, colorId: 3, localUnitPrice: 80, currentUnitPrice: 90 }] })[0],
  ).toContain('precio en el dispositivo 80, precio vigente 90');
  expect(
    describirDetalle({ variants: [{ productId: 1, sizeId: 2, colorId: 3, requested: 2, available: 1, quota: 1 }] })[0],
  ).toContain('cupo de la caja: 1');
  expect(describirDetalle(null)).toEqual([]);
});
