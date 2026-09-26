import { ErrorApi } from '../types/api';
import type { CanalVenta } from '../types/domain';
import type {
  ConteoPorEstado,
  FiltroInventarioReporte,
  FiltroReporte,
  ReporteCaja,
  ReporteInventario,
  ReporteVentas,
  ResumenCaja,
  ResumenInventario,
  TopProducto,
} from '../types/reportes';
import { ESTADOS_RESERVA, type EstadoReservaBackend } from './reservas.contratos';
import { CANALES_API } from './ventas.contratos';

type CanalBackend = (typeof CANALES_API)[keyof typeof CANALES_API];

interface PeriodoBackend {
  from: string;
  to: string;
  timeZone: string;
}
interface MetricasVentaBackend {
  currency: string;
  saleCount: number;
  unitsSold: number;
  revenue: number;
  averageTicket: number;
}
export interface ReporteVentasBackend {
  period: PeriodoBackend;
  totals: MetricasVentaBackend[];
  byBranch: Array<MetricasVentaBackend & { branchId: number | null; branchName: string | null }>;
  byChannel: Array<MetricasVentaBackend & { channel: CanalBackend }>;
  daily: Array<MetricasVentaBackend & { date: string }>;
  hourly?: Array<MetricasVentaBackend & { hour: number }>;
}
interface MetricasCajaBackend {
  shiftCount: number;
  openShifts: number;
  saleCount: number;
  cash: number;
  card: number;
  qr: number;
  transfer: number;
  total: number;
  difference: number;
  shiftsWithDifference: number;
}
export interface ReporteCajaBackend {
  period: PeriodoBackend;
  totals: Array<MetricasCajaBackend & { currency: string }>;
  byRegister: Array<
    MetricasCajaBackend & { currency: string; registerId: number; registerName: string; branchId: number; branchName: string }
  >;
  shifts: Array<{
    id: number;
    registerName: string;
    branchName: string;
    cashier: string;
    openedAt: string;
    closedAt: string | null;
    currency: string;
    openingCash: number;
    cash: number;
    card: number;
    qr: number;
    transfer: number;
    total: number;
    saleCount: number;
    expectedCash: number;
    countedCash: number | null;
    difference: number | null;
  }>;
}
export interface TopProductosBackend {
  period: PeriodoBackend;
  items: Array<{
    productId: number;
    productName: string;
    currency: string;
    unitsSold: number;
    saleCount: number;
    revenue: number;
    rank: number;
  }>;
}
interface MetricasInventarioBackend {
  variantCount: number;
  physical: number;
  reserved: number;
  available: number;
  incoming: number;
  lowStockCount: number;
  outOfStockCount: number;
}
export interface ReporteInventarioBackend {
  summary?: MetricasInventarioBackend;
  byBranch: Array<MetricasInventarioBackend & { branchId: number; branchName: string }>;
  items: Array<{
    id: number;
    branchId: number;
    branchName: string;
    branchActive: boolean;
    productId: number;
    productName: string;
    productActive: boolean;
    sizeName: string;
    colorName: string;
    physical: number;
    reserved: number;
    available: number;
    incoming: number;
    lowStock: boolean;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface ReporteReservasBackend {
  period: PeriodoBackend;
  items: Array<{ branchId: number; branchName: string; status: EstadoReservaBackend; count: number }>;
}

export const CANALES_UI = Object.fromEntries(
  Object.entries(CANALES_API).map(([ui, api]) => [api, ui]),
) as Record<CanalBackend, CanalVenta>;

const diaBolivia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia comercial actual en Bolivia, independiente de la zona del navegador. */
export function hoyBolivia(ahora = new Date()): string {
  return diaBolivia.format(ahora);
}

export function sumarDias(dia: string, dias: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
}

export function filtrosReporteApi(f: FiltroReporte = {}) {
  if (f.desde && f.hasta && f.desde > f.hasta)
    throw new ErrorApi('La fecha final debe ser igual o posterior a la inicial.', 400);
  return {
    from: f.desde || undefined,
    to: f.hasta || undefined,
    branchId: f.id_sucursal || undefined,
    channel: f.canal ? CANALES_API[f.canal] : undefined,
  };
}

export function filtrosInventarioApi(f: FiltroInventarioReporte = {}) {
  return {
    branchId: f.id_sucursal || undefined,
    lowStockThreshold: f.umbral,
    lowStockOnly: f.solo_stock_bajo === undefined ? undefined : String(f.solo_stock_bajo),
    page: f.page ?? 1,
    limit: f.page_size ?? 20,
  };
}

/** La moneda de la tienda es BOB; si no hubo ventas en BOB se muestra la primera disponible. */
function monedaPrincipal(monedas: string[]): string {
  return monedas.includes('BOB') ? 'BOB' : (monedas[0] ?? 'BOB');
}

export function adaptarReporteVentas(v: ReporteVentasBackend): ReporteVentas {
  const monedas = v.totals.map((t) => t.currency);
  const moneda = monedaPrincipal(monedas);
  const total = v.totals.find((t) => t.currency === moneda);
  const porDia = new Map(
    v.daily.filter((d) => d.currency === moneda).map((d) => [d.date, d]),
  );
  const diario = [];
  for (let dia = v.period.from; dia <= v.period.to; dia = sumarDias(dia, 1)) {
    const punto = porDia.get(dia);
    diario.push({ periodo: dia, total: punto?.revenue ?? 0, cantidad: punto?.saleCount ?? 0 });
  }
  // Se muestra al menos el horario comercial (8 a 21) y cualquier hora con ventas fuera de el.
  const porHoraMap = new Map((v.hourly ?? []).filter((h) => h.currency === moneda).map((h) => [h.hour, h]));
  const horas = [...porHoraMap.keys()];
  const por_hora = [];
  for (let hora = Math.min(8, ...horas); hora <= Math.max(21, ...horas); hora++) {
    const punto = porHoraMap.get(hora);
    por_hora.push({ hora, total: punto?.revenue ?? 0, cantidad: punto?.saleCount ?? 0 });
  }
  return {
    desde: v.period.from,
    hasta: v.period.to,
    moneda,
    otras_monedas: monedas.filter((m) => m !== moneda),
    resumen: {
      monto_total: total?.revenue ?? 0,
      cantidad_ventas: total?.saleCount ?? 0,
      ticket_promedio: total?.averageTicket ?? 0,
      unidades_vendidas: total?.unitsSold ?? 0,
    },
    diario,
    por_hora,
    por_sucursal: v.byBranch
      .filter((b) => b.currency === moneda)
      .map((b) => ({
        id_sucursal: b.branchId,
        sucursal: b.branchName ?? 'Sin sucursal',
        total: b.revenue,
        cantidad: b.saleCount,
        unidades: b.unitsSold,
      })),
    por_canal: v.byChannel
      .filter((c) => c.currency === moneda)
      .map((c) => ({ canal: CANALES_UI[c.channel], total: c.revenue, cantidad: c.saleCount })),
  };
}

export function adaptarTopProductos(v: TopProductosBackend): TopProducto[] {
  const moneda = monedaPrincipal([...new Set(v.items.map((i) => i.currency))]);
  return v.items
    .filter((i) => i.currency === moneda)
    .map((i) => ({
      id_producto: i.productId,
      moneda: i.currency,
      nombre: i.productName,
      unidades: i.unitsSold,
      total: i.revenue,
      ventas: i.saleCount,
      posicion: i.rank,
    }));
}

const RESUMEN_VACIO: MetricasInventarioBackend = {
  variantCount: 0,
  physical: 0,
  reserved: 0,
  available: 0,
  incoming: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
};
const adaptarMetricasInventario = (m: MetricasInventarioBackend): ResumenInventario => ({
  variantes: m.variantCount,
  fisico: m.physical,
  reservado: m.reserved,
  disponible: m.available,
  entrante: m.incoming,
  stock_bajo: m.lowStockCount,
  agotados: m.outOfStockCount,
});

export function adaptarReporteInventario(v: ReporteInventarioBackend): ReporteInventario {
  return {
    resumen: adaptarMetricasInventario(v.summary ?? RESUMEN_VACIO),
    por_sucursal: v.byBranch.map((b) => ({
      ...adaptarMetricasInventario(b),
      id_sucursal: b.branchId,
      sucursal: b.branchName,
    })),
    items: v.items.map((i) => ({
      id_inventario: i.id,
      id_sucursal: i.branchId,
      sucursal: i.branchName,
      sucursal_activa: i.branchActive,
      id_producto: i.productId,
      producto: i.productName,
      producto_activo: i.productActive,
      talla: i.sizeName,
      color: i.colorName,
      fisico: i.physical,
      reservado: i.reserved,
      disponible: i.available,
      entrante: i.incoming,
      stock_bajo: i.lowStock,
    })),
    page: v.meta.page,
    page_size: v.meta.limit,
    total: v.meta.total,
    paginas: v.meta.totalPages,
  };
}

const adaptarMetricasCaja = (m: MetricasCajaBackend): ResumenCaja => ({
  turnos: m.shiftCount,
  turnos_abiertos: m.openShifts,
  ventas: m.saleCount,
  efectivo: m.cash,
  tarjeta: m.card,
  qr: m.qr,
  transferencia: m.transfer,
  total: m.total,
  diferencia: m.difference,
  turnos_con_diferencia: m.shiftsWithDifference,
});

export function adaptarReporteCaja(v: ReporteCajaBackend): ReporteCaja {
  const moneda = monedaPrincipal(v.totals.map((t) => t.currency));
  const total = v.totals.find((t) => t.currency === moneda);
  return {
    desde: v.period.from,
    hasta: v.period.to,
    moneda,
    resumen: adaptarMetricasCaja(
      total ?? {
        shiftCount: 0,
        openShifts: 0,
        saleCount: 0,
        cash: 0,
        card: 0,
        qr: 0,
        transfer: 0,
        total: 0,
        difference: 0,
        shiftsWithDifference: 0,
      },
    ),
    por_caja: v.byRegister
      .filter((r) => r.currency === moneda)
      .map((r) => ({
        ...adaptarMetricasCaja(r),
        id_caja: r.registerId,
        caja: r.registerName,
        id_sucursal: r.branchId,
        sucursal: r.branchName,
      })),
    turnos: v.shifts.map((s) => ({
      id_turno: s.id,
      caja: s.registerName,
      sucursal: s.branchName,
      cajero: s.cashier,
      apertura: s.openedAt,
      cierre: s.closedAt,
      moneda: s.currency,
      saldo_inicial: s.openingCash,
      efectivo: s.cash,
      tarjeta: s.card,
      qr: s.qr,
      transferencia: s.transfer,
      total: s.total,
      ventas: s.saleCount,
      efectivo_esperado: s.expectedCash,
      efectivo_contado: s.countedCash,
      diferencia: s.difference,
    })),
  };
}

/** Suma todas las sucursales autorizadas; incluye los estados sin reservas en cero. */
export function adaptarReservasPorEstado(v: ReporteReservasBackend): ConteoPorEstado[] {
  return (Object.keys(ESTADOS_RESERVA) as EstadoReservaBackend[]).map((status) => ({
    estado: ESTADOS_RESERVA[status],
    cantidad: v.items.filter((i) => i.status === status).reduce((acc, i) => acc + i.count, 0),
  }));
}
