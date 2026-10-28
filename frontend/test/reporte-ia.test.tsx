// F8: reportes generativos del catalogo analitico (tabla, grafico elegido y aclaraciones).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adaptarReporteIA, type ReporteIABackend } from '../src/api/ia.contratos';
import { instancia } from '../src/api/http';
import { guardarToken } from '../src/api/sesion';
import { tablaCatalogo } from '../src/features/reports/datos-exportacion';
import PaginaReporteIA from '../src/features/reports/PaginaReporteIA';
import { respuesta } from './fixtures';

const porSucursal: ReporteIABackend = {
  status: 'OK',
  question: 'ventas por sucursal de este mes',
  source: 'rules',
  model: null,
  summary: 'Ventas del 2026-10-01 al 2026-10-27: Bs 210.00 en 2 grupos.',
  interpretation: {
    report: 'sales-grouped',
    groupBy: 'branch',
    from: '2026-10-01',
    to: '2026-10-27',
    branchName: null,
    branchNames: ['Central', 'Norte'],
    categoryNames: ['Pantalones'],
    productNames: [],
    explanation: 'Reporte de ventas agrupadas por sucursal.',
  },
  table: {
    columns: [
      { key: 'label', label: 'Sucursal', format: 'text' },
      { key: 'revenue', label: 'Ingresos (Bs)', format: 'money' },
      { key: 'share', label: '% ingresos', format: 'percent' },
    ],
    rows: [
      { label: 'Central', revenue: 190, share: 90.5 },
      { label: 'Norte', revenue: 20, share: 9.5 },
    ],
  },
  chart: {
    type: 'bar',
    title: 'Ingresos por sucursal',
    x: 'label',
    y: [{ key: 'revenue', label: 'Ingresos (Bs)' }],
    reason: 'Comparacion entre grupos.',
  },
  result: { items: [] },
};
const aclaracion: ReporteIABackend = {
  status: 'NEEDS_CLARIFICATION',
  question: 'hola',
  source: 'rules',
  model: null,
  summary: 'No identifique el reporte.',
  suggestions: ['Productos con menor existencia', 'Ventas por semana de los ultimos 60 dias'],
  interpretation: null,
  table: null,
  chart: null,
  result: null,
};

describe('adaptador del reporte IA (F8)', () => {
  it('convierte la tabla y la especificacion de grafico del catalogo', () => {
    const r = adaptarReporteIA(porSucursal);
    expect(r.tipo).toBe('catalogo');
    if (r.tipo !== 'catalogo') return;
    expect(r.grafico).toMatchObject({
      tipo: 'barras',
      x: 'label',
      series: [{ clave: 'revenue' }],
    });
    expect(r.interpretacion).toMatchObject({
      sucursales: ['Central', 'Norte'],
      categorias: ['Pantalones'],
      agrupacion: 'branch',
    });
    const hoja = tablaCatalogo(r.grafico.titulo, r.tabla);
    expect(hoja.columnas.map((c) => c.tipo)).toEqual([undefined, 'dinero', 'numero']);
    expect(hoja.filas).toEqual([
      ['Central', 190, 90.5],
      ['Norte', 20, 9.5],
    ]);
  });

  it('distingue aclaraciones y rechazos sin datos', () => {
    expect(adaptarReporteIA(aclaracion)).toMatchObject({
      tipo: 'aclaracion',
      sugerencias: aclaracion.suggestions,
    });
    expect(adaptarReporteIA({ ...aclaracion, status: 'UNSUPPORTED' }).tipo).toBe('no_soportado');
  });
});

describe('pagina de reportes con IA', () => {
  let root: Root;
  let container: HTMLDivElement;
  let qc: QueryClient;
  const preguntas: string[] = [];
  beforeEach(() => {
    localStorage.clear();
    guardarToken('jwt-admin');
    preguntas.length = 0;
    instancia.defaults.adapter = async (c) => {
      if (c.url === '/ai/status')
        return respuesta(c, {
          provider: 'none',
          model: null,
          configured: false,
        });
      const { question } = JSON.parse(c.data) as { question: string };
      preguntas.push(question);
      return respuesta(c, question === 'hola' ? aclaracion : porSucursal);
    };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    qc.clear();
    container.remove();
  });
  const esperar = () => act(async () => new Promise((r) => setTimeout(r, 40)));
  const escribir = async (texto: string) => {
    await act(async () => {
      const input = document.getElementById('pregunta-reporte') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texto);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => container.querySelector('form')!.requestSubmit());
    await esperar();
  };

  it('muestra la tabla del catalogo, los filtros y la exportacion', async () => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <PaginaReporteIA />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    await escribir('ventas por sucursal de este mes');
    const texto = container.textContent ?? '';
    expect(texto).toContain('Ingresos por sucursal');
    expect(texto).toContain('Sucursales: Central, Norte');
    expect(texto).toContain('Categorias: Pantalones');
    expect(texto).toContain('90.5%');
    expect([...container.querySelectorAll('tbody tr')].map((tr) => tr.firstElementChild?.textContent)).toEqual([
      'Central',
      'Norte',
    ]);
    expect(container.querySelector('[data-tipo="barras"]')).not.toBeNull();
    expect(texto).toContain('Exportar Excel');
  });

  it('pide aclaracion y ofrece sugerencias que generan el reporte', async () => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <PaginaReporteIA />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    await escribir('hola');
    expect(container.textContent).toContain('Necesito una aclaracion');
    expect(container.textContent).not.toContain('Exportar Excel');
    const sugerencia = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Productos con menor existencia',
    )!;
    await act(async () => sugerencia.click());
    await esperar();
    expect(preguntas).toEqual(['hola', 'Productos con menor existencia']);
  });
});
