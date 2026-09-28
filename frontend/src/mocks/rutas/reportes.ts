/** Reportes de la demo con la misma forma que devuelve NestJS en /reports. */
import { hoyBolivia, sumarDias } from '../../api/reportes.contratos';
import { ESTADOS_RESERVA } from '../../api/reservas.contratos';
import { CANALES_API } from '../../api/ventas.contratos';
import { redondear, stockDisponible } from '../../lib/domain';
import { EstadoVenta, type Venta } from '../../types/domain';
import { inventario, productos, reservas, sucursales, ventas } from '../db';
import { expandirInventario, num, type RutaMock } from '../core';

const ESTADOS_API = Object.fromEntries(
  Object.entries(ESTADOS_RESERVA).map(([api, ui]) => [ui, api]),
) as Record<string, string>;

function periodo(params: Record<string, unknown>) {
  const to = params.to ? String(params.to) : hoyBolivia();
  const from = params.from ? String(params.from) : sumarDias(to, -29);
  return { from, to, timeZone: 'America/La_Paz' };
}

function ventasFiltradas(params: Record<string, unknown>): Venta[] {
  const { from, to } = periodo(params);
  const idSucursal = num(params.branchId);
  const canal = params.channel ? String(params.channel) : undefined;
  return ventas.filter(
    (v) =>
      v.estado !== EstadoVenta.ANULADA &&
      (!idSucursal || v.id_sucursal === idSucursal) &&
      (!canal || CANALES_API[v.canal as keyof typeof CANALES_API] === canal) &&
      v.fecha.slice(0, 10) >= from &&
      v.fecha.slice(0, 10) <= to,
  );
}

function metricas(lista: Venta[]) {
  const revenue = redondear(lista.reduce((acc, v) => acc + v.total, 0));
  return {
    currency: 'BOB',
    saleCount: lista.length,
    unitsSold: lista.reduce((acc, v) => acc + v.detalles.reduce((a, d) => a + d.cantidad, 0), 0),
    revenue,
    averageTicket: lista.length ? redondear(revenue / lista.length) : 0,
  };
}

function agrupar<T, K>(lista: T[], clave: (item: T) => K): Map<K, T[]> {
  const grupos = new Map<K, T[]>();
  for (const item of lista) grupos.set(clave(item), [...(grupos.get(clave(item)) ?? []), item]);
  return grupos;
}

export const rutasReportes: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/reports\/sales$/,
    handler: ({ params }) => {
      const lista = ventasFiltradas(params);
      return {
        period: periodo(params),
        totals: lista.length ? [metricas(lista)] : [],
        byBranch: [...agrupar(lista, (v) => v.id_sucursal)].map(([id, grupo]) => ({
          branchId: id,
          branchName: sucursales.find((s) => s.id_sucursal === id)?.nombre ?? null,
          ...metricas(grupo),
        })),
        byChannel: [...agrupar(lista, (v) => v.canal)].map(([canal, grupo]) => ({
          channel: CANALES_API[canal as keyof typeof CANALES_API],
          ...metricas(grupo),
        })),
        daily: [...agrupar(lista, (v) => v.fecha.slice(0, 10))]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, grupo]) => ({ date, ...metricas(grupo) })),
        hourly: [...agrupar(lista, (v) => new Date(v.fecha).getHours())]
          .sort(([a], [b]) => a - b)
          .map(([hour, grupo]) => ({ hour, ...metricas(grupo) })),
      };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/reports\/cash-shifts$/,
    // La demo local no simula turnos de caja.
    handler: ({ params }) => ({ period: periodo(params), totals: [], byRegister: [], shifts: [] }),
  },
  {
    metodo: 'GET',
    patron: /^\/reports\/top-products$/,
    handler: ({ params }) => {
      const acumulado = new Map<number, { unitsSold: number; revenue: number; ventas: Set<number> }>();
      for (const v of ventasFiltradas(params)) {
        for (const d of v.detalles) {
          const actual = acumulado.get(d.id_producto) ?? { unitsSold: 0, revenue: 0, ventas: new Set() };
          actual.unitsSold += d.cantidad;
          actual.revenue = redondear(actual.revenue + d.cantidad * d.precio_unitario - d.descuento);
          actual.ventas.add(v.id_venta);
          acumulado.set(d.id_producto, actual);
        }
      }
      return {
        period: periodo(params),
        items: [...acumulado]
          .sort(([, a], [, b]) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
          .slice(0, num(params.limit) ?? 10)
          .map(([id, m], i) => ({
            productId: id,
            productName: productos.find((p) => p.id_producto === id)?.nombre ?? 'Producto',
            currency: 'BOB',
            unitsSold: m.unitsSold,
            saleCount: m.ventas.size,
            revenue: m.revenue,
            rank: i + 1,
          })),
      };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/reports\/inventory$/,
    handler: ({ params }) => {
      const idSucursal = num(params.branchId);
      const umbral = num(params.lowStockThreshold) ?? 5;
      const page = num(params.page) ?? 1;
      const limit = num(params.limit) ?? 20;
      const filas = inventario
        .filter(
          (i) =>
            (!idSucursal || i.id_sucursal === idSucursal) &&
            (params.lowStockOnly !== 'true' || stockDisponible(i) <= umbral),
        )
        .map(expandirInventario)
        .sort((a, b) => stockDisponible(a) - stockDisponible(b) || a.id_inventario - b.id_inventario);
      const resumen = (lista: typeof filas) => ({
        variantCount: lista.length,
        physical: lista.reduce((acc, i) => acc + i.cantidad_fisica, 0),
        reserved: lista.reduce((acc, i) => acc + i.cantidad_reservada, 0),
        available: lista.reduce((acc, i) => acc + stockDisponible(i), 0),
        incoming: 0,
        lowStockCount: lista.filter((i) => stockDisponible(i) <= umbral).length,
        outOfStockCount: lista.filter((i) => stockDisponible(i) <= 0).length,
      });
      return {
        summary: resumen(filas),
        byBranch: [...agrupar(filas, (i) => i.id_sucursal)].map(([id, grupo]) => ({
          branchId: id,
          branchName: grupo[0].sucursal?.nombre ?? '',
          ...resumen(grupo),
        })),
        items: filas.slice((page - 1) * limit, page * limit).map((i) => ({
          id: i.id_inventario,
          branchId: i.id_sucursal,
          branchName: i.sucursal?.nombre ?? '',
          branchActive: i.sucursal?.activa ?? true,
          productId: i.id_producto,
          productName: i.producto?.nombre ?? '',
          productActive: i.producto?.activo ?? true,
          sizeName: i.talla?.nombre ?? '',
          colorName: i.color?.nombre ?? '',
          physical: i.cantidad_fisica,
          reserved: i.cantidad_reservada,
          available: stockDisponible(i),
          incoming: 0,
          lowStock: stockDisponible(i) <= umbral,
        })),
        meta: { page, limit, total: filas.length, totalPages: Math.ceil(filas.length / limit) },
      };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/reports\/reservations$/,
    handler: ({ params }) => {
      const idSucursal = num(params.branchId);
      const lista = idSucursal ? reservas.filter((r) => r.id_sucursal === idSucursal) : reservas;
      return {
        period: periodo(params),
        items: [...agrupar(lista, (r) => `${r.id_sucursal}|${r.estado}`)].map(([, grupo]) => ({
          branchId: grupo[0].id_sucursal,
          branchName: sucursales.find((s) => s.id_sucursal === grupo[0].id_sucursal)?.nombre ?? '',
          status: ESTADOS_API[grupo[0].estado],
          count: grupo.length,
        })),
      };
    },
  },
];
