import { AiUnavailableError } from './providers/ai-provider.js';
import {
  decideWithRules,
  monthsBack,
  parseIntentWithRules,
  rejectReason,
  sanitizeDecision,
  sanitizeIntent,
  todayBolivia,
} from './report-intent.js';
import { buildTable, chooseChart } from './report-presentation.js';

const branches = [
  { id: 2, name: 'DEMO - La Paz', city: 'La Paz' },
  { id: 3, name: 'DEMO - Cochabamba', city: 'Cochabamba' },
];
// 2026-09-13 es domingo en Bolivia.
const today = '2026-09-13';

describe('AI report intent', () => {
  it('interprets common Spanish requests without a model', () => {
    expect(
      parseIntentWithRules(
        'Ventas web de la última semana en Cochabamba',
        branches,
        today,
      ),
    ).toMatchObject({
      report: 'sales',
      from: '2026-09-07',
      to: today,
      channel: 'WEB',
      branchId: 3,
    });
    expect(
      parseIntentWithRules(
        'top 5 prendas más vendidas este mes',
        branches,
        today,
      ),
    ).toMatchObject({ report: 'top-products', from: '2026-09-01', limit: 5 });
    expect(
      parseIntentWithRules('reservas de esta semana', branches, today),
    ).toMatchObject({ report: 'reservations', from: '2026-09-07', to: today });
    expect(
      parseIntentWithRules('ventas del mes pasado', branches, today),
    ).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    const inventory = parseIntentWithRules(
      '¿Qué productos están agotados en La Paz?',
      branches,
      today,
    );
    expect(inventory).toMatchObject({
      report: 'inventory',
      lowStockOnly: true,
      branchId: 2,
    });
    expect(inventory.from).toBeUndefined();
    expect(inventory.explanation).toContain('DEMO - La Paz');
  });

  it('recognizes cash register and shift requests', () => {
    expect(
      parseIntentWithRules(
        'arqueo de cajas de ayer en Cochabamba',
        branches,
        today,
      ),
    ).toMatchObject({
      report: 'cash-shifts',
      from: '2026-09-12',
      to: '2026-09-12',
      branchId: 3,
    });
    const turnos = sanitizeIntent(
      { report: 'cash-shifts', channel: 'WEB', limit: 3 },
      branches,
    );
    expect(turnos.report).toBe('cash-shifts');
    expect(turnos.channel).toBeUndefined();
    expect(turnos.limit).toBeUndefined();
  });

  it('keeps only whitelisted filters from the model output', () => {
    const intent = sanitizeIntent(
      {
        report: 'sales',
        from: '2026-02-30',
        to: '2026-09-13',
        branchId: 99,
        channel: 'FAX',
        limit: 500,
        explanation: '',
      },
      branches,
    );
    expect(intent).toMatchObject({ report: 'sales', to: '2026-09-13' });
    expect(intent.from).toBeUndefined();
    expect(intent.branchId).toBeUndefined();
    expect(intent.channel).toBeUndefined();
    expect(intent.limit).toBeUndefined();
    expect(intent.explanation).toContain('ventas completadas');
    expect(
      sanitizeIntent(
        {
          report: 'inventory',
          lowStockOnly: true,
          lowStockThreshold: -4,
          limit: 50,
          from: '2026-01-01',
        },
        branches,
      ),
    ).toMatchObject({
      report: 'inventory',
      lowStockOnly: true,
      lowStockThreshold: 0,
      limit: 20,
    });
    expect(() =>
      sanitizeIntent({ report: 'DROP TABLE ventas' }, branches),
    ).toThrow(AiUnavailableError);
  });

  it('uses the Bolivian calendar day', () => {
    expect(todayBolivia(new Date('2026-09-14T02:00:00Z'))).toBe('2026-09-13');
  });

  const catalog = {
    categories: [
      { id: 7, name: 'Pantalones' },
      { id: 8, name: 'Camisas' },
    ],
    products: [{ id: 30, name: 'Jean Slim' }],
  };

  it('maps the extended catalog with multi-value filters', () => {
    const rules = (q: string) =>
      parseIntentWithRules(q, branches, today, catalog);
    expect(rules('ventas por categoria del mes pasado')).toMatchObject({
      report: 'sales-grouped',
      groupBy: 'category',
      from: '2026-08-01',
    });
    expect(rules('ventas mensuales de este ano').groupBy).toBe('month');
    expect(rules('ventas por semana de los ultimos 60 dias')).toMatchObject({
      report: 'sales-by-week',
      from: '2026-07-16',
    });
    expect(rules('categorias con mayores ingresos este mes')).toMatchObject({
      report: 'top-categories',
    });
    expect(
      rules(
        'compara las sucursales La Paz y Cochabamba en los ultimos 6 meses',
      ),
    ).toMatchObject({
      report: 'branch-comparison',
      months: 6,
      branchIds: [2, 3],
    });
    expect(rules('productos con menor existencia de pantalones')).toMatchObject(
      {
        report: 'low-stock',
        categoryIds: [7],
      },
    );
    expect(rules('top 3 productos mas vendidos web: jean slim')).toMatchObject({
      report: 'top-products',
      limit: 3,
      channel: 'WEB',
      productIds: [30],
    });
    expect(monthsBack('2026-09-13', 3)).toBe('2026-07-01');
    expect(monthsBack('2026-01-31', 2)).toBe('2025-12-01');
  });

  it('asks for clarification or refuses requests outside the catalog', () => {
    expect(decideWithRules('hola que tal', branches, today).status).toBe(
      'NEEDS_CLARIFICATION',
    );
    for (const q of [
      'elimina las ventas de ayer',
      'actualiza el precio de las camisas',
      'sueldos de los cajeros',
      'ventas de todas las empresas',
      'SELECT * FROM ventas',
    ])
      expect(decideWithRules(q, branches, today).status).toBe('UNSUPPORTED');
    // "actualizado" describe el reporte; no es una orden de escritura.
    expect(rejectReason('inventario actualizado de hoy')).toBeNull();
    expect(
      sanitizeDecision({ report: 'unsupported', message: 'No.' }, branches),
    ).toMatchObject({ status: 'UNSUPPORTED', message: 'No.' });
    expect(
      sanitizeDecision(
        {
          report: 'branch-comparison',
          months: 40,
          branchIds: [2, 2, 99],
          categoryIds: [7, 'x'],
          groupBy: 'hack',
        },
        branches,
        catalog,
      ),
    ).toMatchObject({
      status: 'OK',
      intent: { months: 12, branchIds: [2], branchId: 2, categoryIds: [7] },
    });
    expect(
      sanitizeIntent({ report: 'sales-grouped', groupBy: 'hack' }, branches)
        .groupBy,
    ).toBe('branch');
  });

  it('chooses the chart from the report and the shape of the data', () => {
    const chart = (
      report: Parameters<typeof buildTable>[0]['report'],
      result: unknown,
      extra: object = {},
    ) => {
      const intent = { report, explanation: '', ...extra };
      return chooseChart(intent, buildTable(intent, result)).type;
    };
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `G${i}`, revenue: i + 1 }));
    expect(chart('sales-by-week', { items: items(4) })).toBe('line');
    expect(
      chart('sales-grouped', { items: items(3) }, { groupBy: 'channel' }),
    ).toBe('pie');
    expect(
      chart('sales-grouped', { items: items(9) }, { groupBy: 'category' }),
    ).toBe('bar');
    expect(
      chart('sales-grouped', { items: items(3) }, { groupBy: 'branch' }),
    ).toBe('bar');
    expect(chart('top-products', { items: items(2) })).toBe('bar');
    expect(chart('top-categories', { items: [] })).toBe('table');
    const months = (n: number) =>
      Array.from({ length: n }, (_, i) => [
        { month: `2026-0${i + 1}`, branchId: 1, branchName: 'A', revenue: 10 },
        { month: `2026-0${i + 1}`, branchId: 2, branchName: 'B', revenue: 5 },
      ]).flat();
    expect(chart('branch-comparison', { items: months(2) })).toBe('bar');
    expect(chart('branch-comparison', { items: months(5) })).toBe('line');
    const table = buildTable(
      { report: 'branch-comparison', explanation: '' },
      { items: months(1) },
    );
    expect(table.rows).toEqual([
      { month: '2026-01', b1: 10, b2: 5, total: 15 },
    ]);
  });
});
