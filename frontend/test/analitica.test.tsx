// F9.8: dashboard analitico con ML.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { ProveedorAuth } from '../src/context/AuthContext';
import PaginaAnalitica from '../src/features/analitica/PaginaAnalitica';
import { navegacionPorRol } from '../src/routes/navegacion';
import { RolNombre } from '../src/types/domain';
import { respuesta, usuarioBackend } from './fixtures';

const metricasDemanda = {
  rows: 4784,
  series: 52,
  weeks: 92,
  crossValidation: {
    method: 'TimeSeriesSplit(5)',
    mean: { mae: 3.5, rmse: 4.7, r2: 0.33 },
    std: { mae: 0.2, rmse: 0.3, r2: 0.05 },
    folds: [{ fold: 1, trainRows: 884, testRows: 780, mae: 3.4, rmse: 4.4, r2: 0.26 }],
  },
  holdout: { weeks: 8, mae: 3.3, rmse: 4.4, r2: 0.36 },
  baselines: { lastWeek: { mae: 4.5, rmse: 6, r2: 0 }, mean4Weeks: { mae: 3.5, rmse: 4.8, r2: 0.3 } },
  beatsBaselines: true,
  improvementVsLastWeek: 0.27,
  featureImportance: [{ feature: 'roll_mean_12', importance: 0.35 }],
};
const entrenado = {
  trained: true,
  model: {
    source: 'synthetic',
    trainedAt: '2026-10-27T23:00:00+00:00',
    asOf: '2026-10-27',
    salesRows: 5408,
    transactions: 5405,
    parts: {
      demand: { status: 'TRAINED', metrics: metricasDemanda },
      segmentation: { status: 'TRAINED', metrics: {} },
      anomalies: { status: 'INSUFFICIENT_DATA', message: 'Se necesitan al menos 20 semanas' },
    },
  },
  scope: null,
  forecast: {
    horizon: 4,
    lastObservedWeek: '2026-10-19',
    series: 52,
    totals: [{ week: '2026-10-26', units: 387.8, low: 359.6, high: 416.3 }],
    top: [
      {
        productId: 1,
        branchId: 2,
        productName: 'Vestido rojo',
        categoryName: 'Vestidos',
        branchName: 'Cochabamba',
        units: 59.8,
        weeks: [{ week: '2026-10-26', units: 14.4, low: 10.3, high: 20.7 }],
      },
    ],
    interval: 'percentiles 10-90',
  },
  segments: {
    summary: [
      {
        segment: 'VIP',
        customers: 99,
        share: 0.25,
        avgRecencyDays: 21.9,
        avgFrequency: 33.9,
        avgMonetary: 16246.63,
        totalMonetary: 1,
        action: 'Atencion preferente.',
      },
    ],
    metrics: {
      customers: 400,
      chosenK: 3,
      selectionRule: 'regla',
      silhouette: 0.43,
      daviesBouldin: 0.82,
      calinskiHarabasz: 480,
      candidates: [],
    },
  },
  anomalies: null,
};

let root: Root;
let container: HTMLDivElement;
let qc: QueryClient;
let llamadas: InternalAxiosRequestConfig[];

function api(rol: 'ADMINISTRATOR' | 'BRANCH_MANAGER', dashboard: () => unknown) {
  instancia.defaults.adapter = async (c) => {
    llamadas.push(c);
    if (c.url === '/auth/me')
      return respuesta(c, {
        ...usuarioBackend,
        client: null,
        roles: [{ role: { id: 1, name: rol, description: null } }],
      });
    if (c.url === '/ml/dashboard') return respuesta(c, dashboard());
    if (c.url === '/ml/train') return respuesta(c, { parts: { demand: { status: 'TRAINED' } } });
    throw new Error(`URL no simulada: ${c.url}`);
  };
}
async function montar() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <ProveedorAuth>
          <MemoryRouter>
            <PaginaAnalitica />
          </MemoryRouter>
        </ProveedorAuth>
      </QueryClientProvider>,
    ),
  );
  for (let i = 0; i < 40 && !/Sin modelos|Prediccion de demanda/.test(container.textContent ?? ''); i++)
    await act(async () => new Promise((r) => setTimeout(r, 25)));
}

beforeEach(() => {
  localStorage.clear();
  guardarToken('jwt');
  llamadas = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  container.remove();
});

it('muestra prediccion, segmentos, metricas y avisa del origen sintetico', async () => {
  api('ADMINISTRATOR', () => entrenado);
  await montar();
  const texto = container.textContent ?? '';
  expect(texto).toContain('datos sinteticos');
  expect(texto).toContain('Vestido rojo');
  expect(texto).toContain('14,4 (10,3–20,7)');
  expect(texto).toContain('mejor que las lineas base');
  expect(texto).toContain('VIP');
  expect(texto).toContain('TimeSeriesSplit(5)');
  // Parte sin datos: se explica en lugar de ocultarse.
  expect(texto).toContain('Se necesitan al menos 20 semanas');
});

it('el administrador entrena cuando no hay modelos y se recarga el tablero', async () => {
  let listo = false;
  api('ADMINISTRATOR', () => (listo ? entrenado : { trained: false }));
  await montar();
  expect(container.textContent).toContain('Sin modelos entrenados');
  listo = true;
  const boton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Con datos sinteticos')!;
  await act(async () => boton.click());
  for (let i = 0; i < 40 && !container.textContent?.includes('Vestido rojo'); i++)
    await act(async () => new Promise((r) => setTimeout(r, 25)));
  expect(JSON.parse(llamadas.find((c) => c.url === '/ml/train')!.data)).toEqual({ source: 'synthetic' });
  expect(container.textContent).toContain('Vestido rojo');
});

it('el encargado no ve el entrenamiento y el menu respeta el plan', async () => {
  api('BRANCH_MANAGER', () => ({ trained: false }));
  await montar();
  expect(container.textContent).not.toContain('Entrenar modelos');
  expect(container.textContent).toContain('Pide al administrador');
  const enlaces = (f?: Parameters<typeof navegacionPorRol>[1]) =>
    navegacionPorRol([RolNombre.ADMINISTRADOR], f).flatMap((g) => g.enlaces.map((e) => e.a));
  expect(enlaces()).toContain('/admin/analitica');
  expect(enlaces((f) => f !== 'mlAnalytics')).not.toContain('/admin/analitica');
});
