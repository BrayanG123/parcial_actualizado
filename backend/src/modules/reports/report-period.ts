import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

export function reportPeriod(from?: string, to?: string, now = new Date()) {
  const today = new Date(now.getTime() - 4 * 3600000)
    .toISOString()
    .slice(0, 10);
  const end = to ?? today;
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!valid(end))
    throw new BadRequestException(
      'Invalid report date; use YYYY-MM-DD (1900–2100)',
    );
  const start =
    from ??
    new Date(Date.parse(end + 'T00:00:00Z') - 29 * 86400000)
      .toISOString()
      .slice(0, 10);
  if (!valid(start))
    throw new BadRequestException(
      'Invalid report date; use YYYY-MM-DD (1900–2100)',
    );
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days < 1 || days > 366)
    throw new BadRequestException('Report period must span 1–366 days');
  return {
    from: start,
    to: end,
    timeZone: 'America/La_Paz',
    start: new Date(start + 'T00:00:00-04:00'),
    endExclusive: new Date(Date.parse(end + 'T00:00:00-04:00') + 86400000),
  };
}

export function reportNumbers(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(reportNumbers);
  if (value && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reportNumbers(item)]),
    );
  return value;
}
