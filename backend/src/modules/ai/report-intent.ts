import { normalize } from './catalog-context.js';
import { AiUnavailableError } from './providers/ai-provider.js';

/** Catalogo de reportes permitidos (seccion 3.6 del plan). */
export const REPORT_KINDS = [
  'sales',
  'sales-grouped',
  'sales-by-week',
  'top-products',
  'top-categories',
  'branch-comparison',
  'low-stock',
  'inventory',
  'reservations',
  'cash-shifts',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const GROUP_BY = [
  'branch',
  'category',
  'channel',
  'day',
  'week',
  'month',
] as const;
export type GroupBy = (typeof GROUP_BY)[number];
const CHANNELS = ['IN_STORE', 'WEB', 'MOBILE'] as const;
type Channel = (typeof CHANNELS)[number];
/** Reportes que aceptan varias sucursales, categorias y productos. */
const MULTI_FILTER: ReportKind[] = [
  'sales-grouped',
  'sales-by-week',
  'top-products',
  'top-categories',
  'branch-comparison',
  'low-stock',
];
const WITH_CHANNEL: ReportKind[] = [
  'sales',
  'sales-grouped',
  'sales-by-week',
  'top-products',
  'top-categories',
  'branch-comparison',
];
const WITH_LIMIT: ReportKind[] = [
  'top-products',
  'top-categories',
  'low-stock',
  'inventory',
];
const NO_PERIOD: ReportKind[] = ['inventory', 'low-stock'];
const MAX_IDS = 10;

export interface BranchOption {
  id: number;
  name: string;
  city: string;
}
export interface NamedOption {
  id: number;
  name: string;
}
export interface ReportCatalog {
  categories?: NamedOption[];
  products?: NamedOption[];
}

/** Filtros permitidos: la IA nunca genera SQL, solo elige entre estos valores. */
export interface ReportIntent {
  report: ReportKind;
  from?: string;
  to?: string;
  /** Una sola sucursal (reportes clasicos) o la unica de `branchIds`. */
  branchId?: number;
  branchIds?: number[];
  categoryIds?: number[];
  productIds?: number[];
  channel?: Channel;
  groupBy?: GroupBy;
  months?: number;
  limit?: number;
  lowStockOnly?: boolean;
  lowStockThreshold?: number;
  explanation: string;
}

/** Resultado del interprete: un reporte, una aclaracion o un rechazo explicado. */
export type ReportDecision =
  | { status: 'OK'; intent: ReportIntent }
  | {
      status: 'NEEDS_CLARIFICATION' | 'UNSUPPORTED';
      message: string;
      suggestions: string[];
    };

export const REPORT_SUGGESTIONS = [
  'Ventas por sucursal de este mes',
  'Ventas por semana de los ultimos 60 dias',
  'Top 10 productos mas vendidos este mes',
  'Categorias con mayores ingresos del mes pasado',
  'Compara las sucursales en los ultimos 3 meses',
  'Productos con menor existencia',
];

const LABELS: Record<ReportKind, string> = {
  sales: 'ventas completadas',
  'sales-grouped': 'ventas agrupadas',
  'sales-by-week': 'ventas por semana',
  'top-products': 'prendas mas vendidas',
  'top-categories': 'categorias con mayores ingresos',
  'branch-comparison': 'comparacion de sucursales por mes',
  'low-stock': 'productos con menor existencia',
  inventory: 'inventario actual',
  reservations: 'reservas por estado (fecha de cita)',
  'cash-shifts': 'turnos y cajas (medios de pago y arqueo)',
};
const GROUP_LABELS: Record<GroupBy, string> = {
  branch: 'sucursal',
  category: 'categoria',
  channel: 'canal',
  day: 'dia',
  week: 'semana',
  month: 'mes',
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

/** Primer dia del mes que esta `months - 1` meses antes del de `day`. */
export const monthsBack = (day: string, months: number) => {
  const date = new Date(`${day.slice(0, 8)}01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - (months - 1));
  return date.toISOString().slice(0, 10);
};

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

/** Solo ids presentes en la lista permitida, sin repetidos y acotados. */
const allowedIds = (value: unknown, options: { id: number }[] = []) => {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const ids = [
    ...new Set(
      list
        .map((v) => clampInt(v, 1, 2147483647))
        .filter((id): id is number => options.some((o) => o.id === id)),
    ),
  ].slice(0, MAX_IDS);
  return ids.length ? ids : undefined;
};

const names = (ids: number[] | undefined, options: NamedOption[] = []) =>
  (ids ?? []).map((id) => options.find((o) => o.id === id)?.name ?? `#${id}`);

function describe(
  intent: Omit<ReportIntent, 'explanation'>,
  branches: BranchOption[],
  catalog: ReportCatalog = {},
) {
  const parts = [`Reporte de ${LABELS[intent.report]}`];
  if (intent.groupBy) parts[0] += ` por ${GROUP_LABELS[intent.groupBy]}`;
  if (intent.report === 'branch-comparison')
    parts.push(`ultimos ${intent.months ?? 3} meses`);
  else if (!NO_PERIOD.includes(intent.report))
    parts.push(
      intent.from || intent.to
        ? `del ${intent.from ?? '(inicio)'} al ${intent.to ?? '(hoy)'}`
        : 'de los ultimos 30 dias',
    );
  const branchNames = names(
    intent.branchIds ?? (intent.branchId ? [intent.branchId] : undefined),
    branches,
  );
  parts.push(
    branchNames.length
      ? `en ${branchNames.join(', ')}`
      : 'en todas las sucursales autorizadas',
  );
  if (intent.channel) parts.push(`canal ${CHANNEL_LABELS[intent.channel]}`);
  if (intent.categoryIds)
    parts.push(
      `categorias ${names(intent.categoryIds, catalog.categories).join(', ')}`,
    );
  if (intent.productIds)
    parts.push(
      `productos ${names(intent.productIds, catalog.products).join(', ')}`,
    );
  if (intent.limit && WITH_LIMIT.includes(intent.report))
    parts.push(`hasta ${intent.limit} filas`);
  if (intent.lowStockOnly) parts.push('solo stock bajo');
  return parts.join(', ') + '.';
}

/** Valida la salida del modelo contra la lista blanca de reportes y filtros. */
export function sanitizeIntent(
  output: unknown,
  branches: BranchOption[],
  catalog: ReportCatalog = {},
): ReportIntent {
  if (!output || typeof output !== 'object')
    throw new AiUnavailableError('Unexpected AI report intent');
  const raw = output as Record<string, unknown>;
  if (!REPORT_KINDS.includes(raw.report as ReportKind))
    throw new AiUnavailableError('Unsupported AI report kind');
  const report = raw.report as ReportKind;
  const intent: Omit<ReportIntent, 'explanation'> = { report };
  if (report === 'branch-comparison')
    intent.months = clampInt(raw.months, 1, 12) ?? 3;
  else if (!NO_PERIOD.includes(report)) {
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
  const branchIds = allowedIds(raw.branchIds ?? raw.branchId, branches);
  if (MULTI_FILTER.includes(report)) {
    intent.branchIds = branchIds;
    intent.categoryIds = allowedIds(raw.categoryIds, catalog.categories);
    intent.productIds = allowedIds(raw.productIds, catalog.products);
  }
  // Los reportes clasicos admiten una sola sucursal.
  if (branchIds?.length === 1) intent.branchId = branchIds[0];
  if (report === 'sales-grouped')
    intent.groupBy = GROUP_BY.includes(raw.groupBy as GroupBy)
      ? (raw.groupBy as GroupBy)
      : 'branch';
  if (
    WITH_CHANNEL.includes(report) &&
    CHANNELS.includes(raw.channel as Channel)
  )
    intent.channel = raw.channel as Channel;
  if (WITH_LIMIT.includes(report)) intent.limit = clampInt(raw.limit, 1, 20);
  if (report === 'inventory') {
    if (typeof raw.lowStockOnly === 'boolean')
      intent.lowStockOnly = raw.lowStockOnly;
    intent.lowStockThreshold = clampInt(raw.lowStockThreshold, 0, 1000);
  }
  for (const key of Object.keys(intent) as (keyof typeof intent)[])
    if (intent[key] === undefined) delete intent[key];
  const explanation =
    typeof raw.explanation === 'string' && raw.explanation.trim()
      ? raw.explanation.trim().slice(0, 300)
      : describe(intent, branches, catalog);
  return { ...intent, explanation };
}

/**
 * Valida la decision completa del modelo: ademas de un reporte puede pedir
 * aclaracion (`clarify`) o declarar la solicitud no soportada (`unsupported`).
 */
export function sanitizeDecision(
  output: unknown,
  branches: BranchOption[],
  catalog: ReportCatalog = {},
): ReportDecision {
  const raw = (output ?? {}) as Record<string, unknown>;
  if (raw.report === 'clarify' || raw.report === 'unsupported') {
    const message =
      typeof raw.message === 'string' && raw.message.trim()
        ? raw.message.trim().slice(0, 300)
        : raw.report === 'clarify'
          ? 'La solicitud es ambigua. Indica que reporte necesitas.'
          : 'Ese reporte no esta disponible.';
    return raw.report === 'clarify'
      ? {
          status: 'NEEDS_CLARIFICATION',
          message,
          suggestions: REPORT_SUGGESTIONS,
        }
      : { status: 'UNSUPPORTED', message, suggestions: REPORT_SUGGESTIONS };
  }
  return { status: 'OK', intent: sanitizeIntent(output, branches, catalog) };
}

/**
 * Pedidos que nunca se atienden, con o sin modelo: escrituras, datos sensibles
 * o de otras empresas. Devuelve el motivo o null.
 */
export function rejectReason(question: string): string | null {
  const q = normalize(question);
  return REJECTIONS.find(([pattern]) => pattern.test(q))?.[1] ?? null;
}
const REJECTIONS: Array<[RegExp, string]> = [
  [
    /\b(elimin|borr|actualiz|modific|cambi|insert|cre)(a|ar|en|e)\b|\b(drop|delete|update|truncate|alter)\b/,
    'Los reportes solo consultan datos; no pueden crear, modificar ni eliminar informacion.',
  ],
  [
    /contrasen|password|clave de acceso|\btoken|tarjeta de credito|\bcvv\b/,
    'Los reportes no muestran credenciales ni datos de pago.',
  ],
  [
    /salario|sueldo|planilla|\bci\b|carnet|telefono|correo de|direccion de|datos personales/,
    'Los reportes no incluyen datos personales de empleados ni clientes.',
  ],
  [
    /otra empresa|otras empresas|todas las empresas|otro tenant|competencia/,
    'Los reportes solo incluyen datos de tu empresa.',
  ],
  [
    /\bselect\b|\bsql\b|\bjoin\b|from\s+\w+\s+where/,
    'No se ejecutan consultas SQL escritas por el usuario; describe el reporte en lenguaje natural.',
  ],
];

const SUPPORTED_TOPIC =
  /vent|vend|ingres|factur|monto|recaud|ticket|ganancia|gananci|inventario|stock|existencia|agotad|reponer|reserva|caja|turno|arqueo|cajer|top|ranking|popular|mejores|categor|sucursal|producto|prenda/;

/** Respaldo sin modelo: interpreta frases comunes en espanol. */
export function parseIntentWithRules(
  question: string,
  branches: BranchOption[],
  today = todayBolivia(),
  catalog: ReportCatalog = {},
): ReportIntent {
  const q = normalize(question);
  const groupMatch =
    /por (sucursal|tienda|categoria|canal|dia|mes)\b|\b(diari|mensual)/.exec(q);
  const report: ReportKind =
    /menor (existencia|stock)|menos (stock|existencia|unidades)|poco stock|por agotarse/.test(
      q,
    )
      ? 'low-stock'
      : /inventario|stock|existencia|agotad|reponer/.test(q)
        ? 'inventory'
        : /reserva/.test(q)
          ? 'reservations'
          : /\bcajas?\b|turno|arqueo|cajer/.test(q)
            ? 'cash-shifts'
            : /compar\w* (las |entre )?sucursal|sucursales\b.*compar|entre sucursales/.test(
                  q,
                )
              ? 'branch-comparison'
              : /categor/.test(q) &&
                  /mas|mayor|top|ranking|mejores|ingreso/.test(q) &&
                  !/por categoria/.test(q)
                ? 'top-categories'
                : /por semana|semanal|cada semana|semana a semana/.test(q)
                  ? 'sales-by-week'
                  : groupMatch
                    ? 'sales-grouped'
                    : /mas vendid|top|ranking|popular|mejores/.test(q)
                      ? 'top-products'
                      : 'sales';
  const intent: Omit<ReportIntent, 'explanation'> = { report };
  if (report === 'sales-grouped') {
    const g = groupMatch?.[1] ?? groupMatch?.[2];
    intent.groupBy =
      g === 'categoria'
        ? 'category'
        : g === 'canal'
          ? 'channel'
          : g === 'dia' || g === 'diari'
            ? 'day'
            : g === 'mes' || g === 'mensual'
              ? 'month'
              : 'branch';
  }

  if (report === 'branch-comparison') {
    const months = /ultim[oa]s?\s+(\d{1,2})\s+meses/.exec(q);
    intent.months = clampInt(months?.[1], 1, 12) ?? 3;
  } else if (!NO_PERIOD.includes(report)) {
    const days = /ultim[oa]s?\s+(\d{1,3})\s+dias/.exec(q);
    const months = /ultim[oa]s?\s+(\d{1,2})\s+meses/.exec(q);
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
    else if (months)
      Object.assign(intent, {
        from: monthsBack(today, clampInt(months[1], 1, 12)!),
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

  if (WITH_CHANNEL.includes(report)) {
    if (/\bweb\b|en linea|online|pagina/.test(q)) intent.channel = 'WEB';
    else if (/movil|\bapp\b|aplicacion|celular/.test(q))
      intent.channel = 'MOBILE';
    else if (/presencial|en caja|punto de venta|en tienda/.test(q))
      intent.channel = 'IN_STORE';
  }
  const matched = branches.filter(
    (b) => q.includes(normalize(b.city)) || q.includes(normalize(b.name)),
  );
  if (matched.length === 1) intent.branchId = matched[0].id;
  if (MULTI_FILTER.includes(report)) {
    if (matched.length)
      intent.branchIds = matched.slice(0, MAX_IDS).map((b) => b.id);
    const mentions = (options: NamedOption[] = []) => {
      const ids = options
        .filter(
          (o) => normalize(o.name).length >= 4 && q.includes(normalize(o.name)),
        )
        .slice(0, MAX_IDS)
        .map((o) => o.id);
      return ids.length ? ids : undefined;
    };
    // Una categoria nombrada en "por categoria" o "categorias con..." no es filtro.
    if (report !== 'top-categories' && intent.groupBy !== 'category') {
      const categoryIds = mentions(catalog.categories);
      if (categoryIds) intent.categoryIds = categoryIds;
    }
    const productIds = mentions(catalog.products);
    if (productIds) intent.productIds = productIds;
  }
  const limit =
    /top\s*(\d{1,2})|(\d{1,2})\s*(?:prendas|productos|variantes|categorias)/.exec(
      q,
    );
  if (limit && WITH_LIMIT.includes(report))
    intent.limit = clampInt(limit[1] ?? limit[2], 1, 20);
  if (report === 'inventory' && /bajo|agotad|critic|reponer|poco/.test(q))
    intent.lowStockOnly = true;
  return { ...intent, explanation: describe(intent, branches, catalog) };
}

/** Respaldo completo sin modelo: rechazo, aclaracion o reporte. */
export function decideWithRules(
  question: string,
  branches: BranchOption[],
  today = todayBolivia(),
  catalog: ReportCatalog = {},
): ReportDecision {
  const reason = rejectReason(question);
  if (reason)
    return {
      status: 'UNSUPPORTED',
      message: reason,
      suggestions: REPORT_SUGGESTIONS,
    };
  if (!SUPPORTED_TOPIC.test(normalize(question)))
    return {
      status: 'NEEDS_CLARIFICATION',
      message:
        'No identifique el reporte. Indica si necesitas ventas, productos, categorias, sucursales, inventario, reservas o cajas, y el periodo.',
      suggestions: REPORT_SUGGESTIONS,
    };
  return {
    status: 'OK',
    intent: parseIntentWithRules(question, branches, today, catalog),
  };
}
