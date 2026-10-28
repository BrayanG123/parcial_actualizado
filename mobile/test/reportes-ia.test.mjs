import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCsv, adaptarReporte, datosGrafico, formatoCelda } from '../src/features/reportes/modelo.ts';

const porSucursal = {
  status: 'OK',
  question: 'ventas por sucursal de este mes',
  source: 'rules',
  summary: 'Ventas del mes: Bs 210.00.',
  interpretation: {
    report: 'sales-grouped',
    from: '2026-10-01',
    to: '2026-10-28',
    explanation: 'Reporte de ventas agrupadas por sucursal.',
    branchName: null,
    branchNames: ['Central', 'Norte'],
    categoryNames: ['Pantalones'],
    channel: 'WEB',
  },
  table: {
    columns: [
      { key: 'label', label: 'Sucursal', format: 'text' },
      { key: 'revenue', label: 'Ingresos (Bs)', format: 'money' },
      { key: 'share', label: '% ingresos', format: 'percent' },
    ],
    rows: [
      { label: 'Central', revenue: 190, share: 90.5 },
      { label: 'Norte; "B"', revenue: 20.5, share: 9.5 },
    ],
  },
  chart: { type: 'bar', title: 'Ingresos por sucursal', x: 'label', y: [{ key: 'revenue', label: 'Ingresos (Bs)' }], reason: 'Comparacion.' },
};

test('adapta el reporte con filtros legibles y el grafico del backend', () => {
  const r = adaptarReporte(porSucursal);
  assert.equal(r.estado, 'OK');
  assert.deepEqual(r.filtros, [
    'Periodo: 2026-10-01 a 2026-10-28',
    'Sucursal: Central, Norte',
    'Categorias: Pantalones',
    'Canal: Web',
  ]);
  assert.equal(r.grafico.tipo, 'barras');
  const g = datosGrafico(r);
  assert.equal(g.barras[0].etiqueta, 'Central');
  assert.equal(g.barras[0].valores[0].proporcion, 1);
  assert.ok(Math.abs(g.barras[1].valores[0].proporcion - 20.5 / 190) < 1e-9);
  assert.equal(g.formato, 'money');
});

test('series temporales muestran las ultimas filas y la torta se vuelve proporcion', () => {
  const filas = Array.from({ length: 20 }, (_, i) => ({ label: `S${i + 1}`, revenue: i + 1 }));
  const semanal = adaptarReporte({
    ...porSucursal,
    table: { columns: porSucursal.table.columns, rows: filas },
    chart: { type: 'line', title: 'Por semana', x: 'label', y: [{ key: 'revenue', label: 'Ingresos' }], reason: '' },
  });
  const g = datosGrafico(semanal, 12);
  assert.equal(g.tipo, 'columnas');
  assert.equal(g.barras.length, 12);
  assert.equal(g.barras[0].etiqueta, 'S9');
  assert.equal(g.omitidas, 8);

  const torta = datosGrafico(
    adaptarReporte({ ...porSucursal, chart: { ...porSucursal.chart, type: 'pie' } }),
  );
  assert.equal(torta.tipo, 'proporcion');
  assert.deepEqual(torta.partes.map((p) => p.porcentaje), [90.3, 9.7]);
});

test('comparacion de sucursales: varias series en la misma escala', () => {
  const r = adaptarReporte({
    ...porSucursal,
    table: {
      columns: [
        { key: 'month', label: 'Mes', format: 'text' },
        { key: 'b1', label: 'Central (Bs)', format: 'money' },
        { key: 'b2', label: 'Norte (Bs)', format: 'money' },
      ],
      rows: [{ month: '2026-09', b1: 100, b2: 50 }, { month: '2026-10', b1: 200, b2: 0 }],
    },
    chart: { type: 'bar', title: 'Por sucursal y mes', x: 'month', y: [{ key: 'b1', label: 'Central' }, { key: 'b2', label: 'Norte' }], reason: '' },
  });
  const g = datosGrafico(r);
  assert.deepEqual(g.barras.map((b) => b.valores.map((v) => v.proporcion)), [[0.5, 0.25], [1, 0]]);
});

test('aclaraciones, rechazos y reportes sin grafico', () => {
  const aclaracion = adaptarReporte({
    status: 'NEEDS_CLARIFICATION',
    question: 'hola',
    source: 'rules',
    summary: 'No identifique el reporte.',
    suggestions: ['Productos con menor existencia'],
    interpretation: null,
    table: null,
    chart: null,
  });
  assert.deepEqual(aclaracion, {
    estado: 'ACLARACION',
    pregunta: 'hola',
    origen: 'rules',
    resumen: 'No identifique el reporte.',
    sugerencias: ['Productos con menor existencia'],
  });
  assert.equal(adaptarReporte({ ...aclaracion, status: 'UNSUPPORTED', question: 'x', summary: 'No', interpretation: null }).estado, 'NO_SOPORTADO');
  const inventario = adaptarReporte({ ...porSucursal, chart: { type: 'table', title: 'Existencias', y: [], reason: '' } });
  assert.equal(datosGrafico(inventario).tipo, 'tabla');
});

test('formatea celdas y exporta CSV seguro para Excel en espanol', () => {
  assert.equal(formatoCelda(null, 'money'), '-');
  assert.equal(formatoCelda(90.5, 'percent'), '90,5%');
  assert.match(formatoCelda(1234.5, 'money'), /^Bs 1.?234,50$/);
  const csv = aCsv(adaptarReporte(porSucursal)).split('\n');
  assert.equal(csv[0], '# Ingresos por sucursal');
  assert.equal(csv[3], 'Sucursal;Ingresos (Bs);% ingresos');
  assert.equal(csv[4], 'Central;190;90,5');
  assert.equal(csv[5], '"Norte; ""B""";20,5;9,5');
});
