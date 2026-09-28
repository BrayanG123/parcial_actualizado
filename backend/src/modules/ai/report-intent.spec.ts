import { AiUnavailableError } from './providers/ai-provider.js';
import {
  parseIntentWithRules,
  sanitizeIntent,
  todayBolivia,
} from './report-intent.js';

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
});
