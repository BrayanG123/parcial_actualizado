import { normalize } from './catalog-context.js';
import { AiUnavailableError } from './providers/ai-provider.js';

export const REPORT_KINDS = [
  'sales',
  'top-products',
  'inventory',
  'reservations',
  'cash-shifts',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
const CHANNELS = ['IN_STORE', 'WEB', 'MOBILE'] as const;
type Channel = (typeof CHANNELS)[number];

export interface BranchOption {
  id: number;
  name: string;
  city: string;
}

/** Filtros permitidos: la IA nunca genera SQL, solo elige entre estos valores. */
export interface ReportIntent {
  report: ReportKind;
  from?: string;
  to?: string;
  branchId?: number;
  channel?: Channel;
  limit?: number;
  lowStockOnly?: boolean;
  lowStockThreshold?: number;
  explanation: string;
}

const LABELS: Record<ReportKind, string> = {
  sales: 'ventas completadas',
  'top-products': 'prendas mas vendidas',
  inventory: 'inventario actual',
  reservations: 'reservas por estado (fecha de cita)',
  'cash-shifts': 'turnos y cajas (medios de pago y arqueo)',
};
const CHANNEL_LABELS: Record<Channel, string> = {
  IN_STORE: 'en tienda',
  WEB: 'web',
  MOBILE: 'movil',
};

const boliviaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const todayBolivia = (now = new Date()) => boliviaDay.format(now);

export const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

const validDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const clampInt = (value: unknown, min: number, max: number) => {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n)
    ? undefined
    : Math.min(max, Math.max(min, Math.trunc(n)));
};

function describe(
  intent: Omit<ReportIntent, 'explanation'>,
  branches: BranchOption[],
) {
  const parts = [`Reporte de ${LABELS[intent.report]}`];
  if (intent.report !== 'inventory')
    parts.push(
      intent.from || intent.to
        ? `del ${intent.from ?? '(inicio)'} al ${intent.to ?? '(hoy)'}`
        : 'de los ultimos 30 dias',
    );
  const branch = branches.find((b) => b.id === intent.branchId);
  parts.push(
    branch ? `en ${branch.name}` : 'en todas las sucursales autorizadas',
  );
  if (intent.channel) parts.push(`canal ${CHANNEL_LABELS[intent.channel]}`);
  if (intent.lowStockOnly) parts.push('solo stock bajo');
  return parts.join(', ') + '.';
}

/** Valida la salida del modelo contra la lista blanca de reportes y filtros. */
export function sanitizeIntent(
  output: unknown,
  branches: BranchOption[],
): ReportIntent {
  if (!output || typeof output !== 'object')
    throw new AiUnavailableError('Unexpected AI report intent');
  const raw = output as Record<string, unknown>;
  if (!REPORT_KINDS.includes(raw.report as ReportKind))
    throw new AiUnavailableError('Unsupported AI report kind');
  const report = raw.report as ReportKind;
  const intent: Omit<ReportIntent, 'explanation'> = { report };
  if (report !== 'inventory') {
    let from = validDay(raw.from) ? raw.from : undefined;
    const to = validDay(raw.to) ? raw.to : undefined;
    const end = to ?? todayBolivia();
    if (
      from &&
      (from > end || Date.parse(end) - Date.parse(from) > 365 * 86400000)
    )
      from = undefined;
    Object.assign(intent, { from, to });
  }
  const branchId = clampInt(raw.branchId, 1, 2147483647);
  if (branches.some((b) => b.id === branchId)) intent.branchId = branchId;
  if (
    (report === 'sales' || report === 'top-products') &&
    CHANNELS.includes(raw.channel as Channel)
  )
    intent.channel = raw.channel as Channel;
  if (report === 'top-products' || report === 'inventory')
    intent.limit = clampInt(raw.limit, 1, 20);
  if (report === 'inventory') {
    if (typeof raw.lowStockOnly === 'boolean')
      intent.lowStockOnly = raw.lowStockOnly;
    intent.lowStockThreshold = clampInt(raw.lowStockThreshold, 0, 1000);
  }
  const explanation =
    typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim().slice(0, 300)
      : describe(intent, branches);
  return { ...intent, explanation };
}

/** Respaldo sin modelo: interpreta frases comunes en espanol. */
export function parseIntentWithRules(
  question: string,
  branches: BranchOption[],
  today = todayBolivia(),
): ReportIntent {
  const q = normalize(question);
  const report: ReportKind = /inventario|stock|existencia|agotad|reponer/.test(
    q,
  )
    ? 'inventory'
    : /reserva/.test(q)
      ? 'reservations'
      : /\bcajas?\b|turno|arqueo|cajer/.test(q)
        ? 'cash-shifts'
        : /mas vendid|top|ranking|popular|mejores/.test(q)
          ? 'top-products'
          : 'sales';
  const intent: Omit<ReportIntent, 'explanation'> = { report };

  if (report !== 'inventory') {
    const days = /ultim[oa]s?\s+(\d{1,3})\s+dias/.exec(q);
    const monthStart = `${today.slice(0, 8)}01`;
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    if (/\bhoy\b/.test(q)) Object.assign(intent, { from: today, to: today });
    else if (/\bayer\b/.test(q))
      Object.assign(intent, {
        from: addDays(today, -1),
        to: addDays(today, -1),
      });
    else if (days)
      Object.assign(intent, {
        from: addDays(today, -(Math.min(366, Number(days[1])) - 1)),
        to: today,
      });
    else if (/semana pasada/.test(q))
      Object.assign(intent, {
        from: addDays(today, -weekday - 7),
        to: addDays(today, -weekday - 1),
      });
    else if (/esta semana/.test(q))
      Object.assign(intent, { from: addDays(today, -weekday), to: today });
    else if (/ultima semana/.test(q))
      Object.assign(intent, { from: addDays(today, -6), to: today });
    else if (/mes pasado/.test(q)) {
      const end = addDays(monthStart, -1);
      Object.assign(intent, { from: `${end.slice(0, 8)}01`, to: end });
    } else if (/este mes/.test(q))
      Object.assign(intent, { from: monthStart, to: today });
    else if (/este ano/.test(q))
      Object.assign(intent, { from: `${today.slice(0, 4)}-01-01`, to: today });
  }

  if (report === 'sales' || report === 'top-products') {
    if (/\bweb\b|en linea|online|pagina/.test(q)) intent.channel = 'WEB';
    else if (/movil|\bapp\b|aplicacion|celular/.test(q))
      intent.channel = 'MOBILE';
    else if (/presencial|en caja|punto de venta|en tienda/.test(q))
      intent.channel = 'IN_STORE';
  }
  const branch = branches.find(
    (b) => q.includes(normalize(b.city)) || q.includes(normalize(b.name)),
  );
  if (branch) intent.branchId = branch.id;
  const limit =
    /top\s*(\d{1,2})|(\d{1,2})\s*(?:prendas|productos|variantes)/.exec(q);
  if (limit && (report === 'top-products' || report === 'inventory'))
    intent.limit = clampInt(limit[1] ?? limit[2], 1, 20);
  if (report === 'inventory' && /bajo|agotad|critic|reponer|poco/.test(q))
    intent.lowStockOnly = true;
  return { ...intent, explanation: describe(intent, branches) };
}
