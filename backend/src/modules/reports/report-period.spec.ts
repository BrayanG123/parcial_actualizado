import { reportNumbers, reportPeriod } from './report-period.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('reportPeriod', () => {
  it('uses inclusive Bolivia days and an exclusive next midnight', () => {
    const period = reportPeriod('2026-09-01', '2026-09-30');
    expect(period.start.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(period.endExclusive.toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
  it('defaults to 30 local days rather than the UTC calendar day', () => {
    const period = reportPeriod(
      undefined,
      undefined,
      new Date('2026-09-13T02:00:00Z'),
    );
    expect(period.from).toBe('2026-08-14');
    expect(period.to).toBe('2026-09-12');
  });
  it('rejects impossible dates, reversed/oversized ranges and timestamps', () => {
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-09-02', '2026-09-01'],
      ['2024-01-01', '2026-01-01'],
      ['2026-09-01T00:00:00Z', '2026-09-02'],
    ])
      expect(() => reportPeriod(from, to)).toThrow();
  });
  it('supports leap days and serializes nested decimal/count aggregates', () => {
    expect(reportPeriod('2024-02-29', '2024-02-29').from).toBe('2024-02-29');
    expect(
      reportNumbers([{ revenue: new Prisma.Decimal('19.99'), units: 2n }]),
    ).toEqual([{ revenue: 19.99, units: 2 }]);
  });
});
