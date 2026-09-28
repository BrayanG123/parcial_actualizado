import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { ProveedorAuth } from '../src/context/AuthContext';
import { ProveedorToast } from '../src/context/ToastContext';
import PaginaDashboard from '../src/features/admin/PaginaDashboard';
import { CampanaNotificaciones } from '../src/features/notifications/CampanaNotificaciones';
import PaginaReporteIA from '../src/features/reports/PaginaReporteIA';
import PaginaReportes from '../src/features/reports/PaginaReportes';
import { pagina } from './catalogo-fixtures';
import { respuesta, usuarioBackend } from './fixtures';

// Recharts mide su contenedor con ResizeObserver, ausente en jsdom.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const periodo = { from: '2026-08-15', to: '2026-09-13', timeZone: 'America/La_Paz' };
const metricas = { currency: 'BOB', saleCount: 30, unitsSold: 60, revenue: 10798, averageTicket: 359.93 };
const ventas = {
  period: periodo,
  filters: {},
  totals: [metricas],
  byBranch: [{ ...metricas, branchId: 2, branchName: 'DEMO - La Paz' }],
  byChannel: [{ ...metricas, channel: 'WEB' }],
  daily: [{ ...metricas, date: '2026-09-10' }],
};
const top = {
  period: periodo,
  items: [
    { productId: 1, productName: 'Vestido modelo 3', currency: 'BOB', unitsSold: 3, saleCount: 3, revenue: 945, rank: 1 },
  ],
};
const resumenInventario = {
  variantCount: 1,
  physical: 1,
  reserved: 0,
  available: 1,
  incoming: 2,
  lowStockCount: 1,
  outOfStockCount: 0,
};
const inventario = {
  summary: resumenInventario,
  byBranch: [{ ...resumenInventario, branchId: 2, branchName: 'DEMO - La Paz' }],
  items: [
    {
      id: 9, branchId: 2, branchName: 'DEMO - La Paz', branchActive: true, productId: 1, productName: 'Polera basica',
      productActive: true, sizeName: 'M', colorName: 'Negro', physical: 1, reserved: 0, available: 1, incoming: 2, lowStock: true,
    },
  ],
  meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
};
const reservas = {
  period: periodo,
  items: [{ branchId: 2, branchName: 'DEMO - La Paz', status: 'PENDING', count: 2 }],
};
const notificacion = {
  id: 5,
  branchId: 2,
  reservationId: 41,
  unitCount: 3,
  approximateTime: '2026-09-14T15:00:00.000Z',
  createdAt: '2026-09-13T12:00:00.000Z',
  branch: { id: 2, name: 'DEMO - La Paz', city: 'La Paz' },
  type: 'RESERVATION_CREATED',
  title: 'Nueva reserva #41',
  message: '3 prendas reservadas',
  reservationStatus: 'PENDING',
  readAt: null,
  isRead: false,
};

let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let llamadas: InternalAxiosRequestConfig[];

function simularApi(rol: 'ADMINISTRATOR' | 'BRANCH_MANAGER') {
  llamadas = [];
  guardarToken('token-de-prueba');
  instancia.defaults.adapter = async (c) => {
    llamadas.push(c);
    const url = c.url ?? '';
    const rutas: Record<string, unknown> = {
      '/auth/me': { ...usuarioBackend, client: null, roles: [{ role: { id: 1, name: rol, description: null } }] },
      '/reports/sales': ventas,
      '/reports/top-products': top,
      '/reports/inventory': inventario,
      '/reports/reservations': reservas,
      '/branches': pagina([{ id: 2, name: 'DEMO - La Paz', city: 'La Paz', address: 'Centro', phone: null, active: true }]),
      '/ai/status': { provider: 'gemini', model: 'gemini-2.5-flash', configured: true },
      '/ai/reports': {
        question: 'ventas web de esta semana',
        source: 'gemini',
        model: 'gemini-2.5-flash',
        summary: 'Resumen de prueba: 30 ventas por Bs 10798.00.',
        interpretation: {
          report: 'sales', from: '2026-09-07', to: '2026-09-13', channel: 'WEB', branchName: null,
          explanation: 'Ventas web de la semana.',
        },
        result: ventas,
      },
      '/notifications/unread-count': { unreadCount: 2 },
      '/notifications': { data: [notificacion], unreadCount: 2, meta: { page: 1, limit: 8, total: 1, totalPages: 1 } },
      '/notifications/5/read': { id: 5, isRead: true, readAt: '2026-09-13T12:05:00.000Z' },
    };
    if (!(url in rutas)) throw new Error(`URL no simulada: ${url}`);
    return respuesta(c, rutas[url]);
  };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
  guardarToken(null);
});

async function montar(elemento: ReactNode) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <ProveedorToast>
            <MemoryRouter>
              <Routes>
                <Route path="/" element={elemento} />
                <Route path="/admin/reservas" element={<p>Pagina de reservas</p>} />
              </Routes>
            </MemoryRouter>
          </ProveedorToast>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
}
async function hasta(condicion: () => boolean) {
  for (let i = 0; i < 60 && !condicion(); i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  expect(condicion()).toBe(true);
}
const texto = () => document.body.textContent ?? '';
const boton = (etiqueta: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === etiqueta)!;

describe('pantallas de reportes, IA y notificaciones con la API real simulada', () => {
  it('arma el dashboard solo con datos de /reports', async () => {
    simularApi('ADMINISTRATOR');
    await montar(<PaginaDashboard />);
    await hasta(() => texto().includes('Polera basica') && texto().includes('Vestido modelo 3'));
    expect(texto()).toContain('10.798');
    expect(texto()).toContain('Pendiente');
    const cita = llamadas.find((c) => c.url === '/reports/reservations');
    expect(cita?.params).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    expect(llamadas.find((c) => c.url === '/reports/inventory')?.params).toMatchObject({ lowStockOnly: 'true' });
  });

  it('no ofrece otras sucursales al encargado y filtra por canal', async () => {
    simularApi('BRANCH_MANAGER');
    await montar(<PaginaReportes />);
    await hasta(() => texto().includes('Ranking de prendas') && texto().includes('Vestido modelo 3'));
    expect(document.getElementById('sucursal-reporte')).toBeNull();
    expect(llamadas.filter((c) => c.url === '/reports/sales').every((c) => c.params.branchId === undefined)).toBe(true);
    await act(async () => {
      const canal = document.getElementById('canal-reporte') as HTMLSelectElement;
      canal.value = 'WEB';
      canal.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await hasta(() => llamadas.some((c) => c.url === '/reports/sales' && c.params.channel === 'WEB'));
  });

  it('genera un reporte con IA y muestra interpretacion, origen y resumen', async () => {
    simularApi('ADMINISTRATOR');
    await montar(<PaginaReporteIA />);
    await hasta(() => texto().includes('Proveedor activo: Gemini'));
    expect(texto()).toContain('no permite dictado');
    await act(async () => boton('Ventas web de la ultima semana').click());
    await hasta(() => texto().includes('Resumen de prueba'));
    expect(JSON.parse(llamadas.find((c) => c.url === '/ai/reports')!.data)).toEqual({
      question: 'Ventas web de la ultima semana',
    });
    expect(texto()).toContain('Canal: Web');
    expect(texto()).toContain('Ventas web de la semana.');
  });

  it('muestra no leidas, marca la notificacion y abre su reserva', async () => {
    simularApi('ADMINISTRATOR');
    await montar(<CampanaNotificaciones rutaReservas="/admin/reservas" />);
    await hasta(() => document.querySelector('.fs-campana__contador')?.textContent === '2');
    await act(async () => (document.querySelector('.fs-campana__boton') as HTMLButtonElement).click());
    await hasta(() => texto().includes('Nueva reserva #41'));
    expect(llamadas.find((c) => c.url === '/notifications')?.params).toMatchObject({ unreadOnly: 'false', limit: 8 });
    await act(async () => (document.querySelector('.fs-campana__item') as HTMLButtonElement).click());
    await hasta(() => texto().includes('Pagina de reservas'));
    await hasta(() => llamadas.some((c) => c.url === '/notifications/5/read' && c.method === 'patch'));
  });
});
