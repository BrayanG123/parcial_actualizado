import { describe, expect, it } from 'vitest';
import {
  adaptarReporteCaja,
  adaptarReporteInventario,
  adaptarReporteVentas,
  adaptarReservasPorEstado,
  adaptarTopProductos,
  filtrosInventarioApi,
  filtrosReporteApi,
  hoyBolivia,
} from '../src/api/reportes.contratos';

const periodo = { from: '2026-09-01', to: '2026-09-03', timeZone: 'America/La_Paz' };
const m = (currency: string, revenue: number, saleCount = 1) => ({
  currency,
  revenue,
  saleCount,
  unitsSold: saleCount * 2,
  averageTicket: revenue / saleCount,
});

describe('contratos de reportes NestJS', () => {
  it('traduce filtros y rechaza un rango invertido antes de consultar', () => {
    expect(filtrosReporteApi({ desde: '2026-09-01', hasta: '2026-09-30', id_sucursal: 2, canal: 'MOVIL' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      branchId: 2,
      channel: 'MOBILE',
    });
    expect(() => filtrosReporteApi({ desde: '2026-09-30', hasta: '2026-09-01' })).toThrow('fecha final');
    expect(filtrosInventarioApi({ solo_stock_bajo: true, umbral: 3 })).toMatchObject({
      lowStockOnly: 'true',
      lowStockThreshold: 3,
      page: 1,
      limit: 20,
    });
  });

  it('usa el dia comercial de Bolivia y no el de UTC', () => {
    expect(hoyBolivia(new Date('2026-09-14T02:30:00Z'))).toBe('2026-09-13');
  });

  it('completa los dias sin ventas y no mezcla monedas', () => {
    const r = adaptarReporteVentas({
      period: periodo,
      totals: [m('BOB', 300, 2), m('USD', 50)],
      byBranch: [{ ...m('BOB', 300, 2), branchId: 1, branchName: 'La Paz' }, { ...m('USD', 50), branchId: 1, branchName: 'La Paz' }],
      byChannel: [{ ...m('BOB', 300, 2), channel: 'IN_STORE' }],
      daily: [{ ...m('BOB', 300, 2), date: '2026-09-02' }, { ...m('USD', 50), date: '2026-09-03' }],
    });
    expect(r.moneda).toBe('BOB');
    expect(r.otras_monedas).toEqual(['USD']);
    expect(r.resumen).toEqual({ monto_total: 300, cantidad_ventas: 2, ticket_promedio: 150, unidades_vendidas: 4 });
    expect(r.diario).toEqual([
      { periodo: '2026-09-01', total: 0, cantidad: 0 },
      { periodo: '2026-09-02', total: 300, cantidad: 2 },
      { periodo: '2026-09-03', total: 0, cantidad: 0 },
    ]);
    expect(r.por_sucursal).toHaveLength(1);
    expect(r.por_canal).toEqual([{ canal: 'PRESENCIAL', total: 300, cantidad: 2 }]);
  });

  it('completa el horario comercial por hora y conserva horas fuera de el', () => {
    const r = adaptarReporteVentas({
      period: periodo,
      totals: [m('BOB', 30, 2)],
      byBranch: [],
      byChannel: [],
      daily: [],
      hourly: [
        { ...m('BOB', 20, 1), hour: 12 },
        { ...m('BOB', 10, 1), hour: 22 },
        { ...m('USD', 99, 1), hour: 9 },
      ],
    });
    expect(r.por_hora[0]).toEqual({ hora: 8, total: 0, cantidad: 0 });
    expect(r.por_hora.at(-1)).toEqual({ hora: 22, total: 10, cantidad: 1 });
    expect(r.por_hora.find((h) => h.hora === 12)).toEqual({ hora: 12, total: 20, cantidad: 1 });
    expect(r.por_hora.find((h) => h.hora === 9)?.total).toBe(0);
  });

  it('adapta turnos y cajas con efectivo esperado, contado y diferencias', () => {
    const metricasCaja = {
      shiftCount: 2,
      openShifts: 1,
      saleCount: 5,
      cash: 60,
      card: 20,
      qr: 5,
      transfer: 0,
      total: 85,
      difference: -5,
      shiftsWithDifference: 1,
    };
    const r = adaptarReporteCaja({
      period: periodo,
      totals: [{ ...metricasCaja, currency: 'BOB' }],
      byRegister: [{ ...metricasCaja, currency: 'BOB', registerId: 4, registerName: 'Caja 1', branchId: 2, branchName: 'La Paz' }],
      shifts: [
        {
          id: 9, registerName: 'Caja 1', branchName: 'La Paz', cashier: 'Cajero', openedAt: '2026-09-02T13:00:00Z', closedAt: null,
          currency: 'BOB', openingCash: 50, cash: 10, card: 0, qr: 0, transfer: 0, total: 10, saleCount: 1, expectedCash: 60,
          countedCash: null, difference: null,
        },
      ],
    });
    expect(r.resumen).toMatchObject({ turnos: 2, turnos_abiertos: 1, diferencia: -5, turnos_con_diferencia: 1 });
    expect(r.por_caja[0]).toMatchObject({ id_caja: 4, caja: 'Caja 1', sucursal: 'La Paz', efectivo: 60 });
    expect(r.turnos[0]).toMatchObject({ id_turno: 9, cierre: null, efectivo_esperado: 60, efectivo_contado: null, diferencia: null });
    expect(adaptarReporteCaja({ period: periodo, totals: [], byRegister: [], shifts: [] }).resumen.turnos).toBe(0);
  });

  it('devuelve ceros cuando no hubo ventas en lugar de inventar indicadores', () => {
    const r = adaptarReporteVentas({ period: periodo, totals: [], byBranch: [], byChannel: [], daily: [] });
    expect(r.resumen.monto_total).toBe(0);
    expect(r.diario).toHaveLength(3);
  });

  it('adapta ranking, inventario y reservas agregadas por estado', () => {
    expect(
      adaptarTopProductos({
        period: periodo,
        items: [
          { productId: 3, productName: 'Blazer', currency: 'BOB', unitsSold: 5, saleCount: 4, revenue: 900, rank: 1 },
          { productId: 4, productName: 'Otro', currency: 'USD', unitsSold: 9, saleCount: 1, revenue: 10, rank: 1 },
        ],
      }),
    ).toEqual([{ id_producto: 3, moneda: 'BOB', nombre: 'Blazer', unidades: 5, total: 900, ventas: 4, posicion: 1 }]);

    const metricas = { variantCount: 1, physical: 4, reserved: 1, available: 3, incoming: 6, lowStockCount: 1, outOfStockCount: 0 };
    const inv = adaptarReporteInventario({
      summary: metricas,
      byBranch: [{ ...metricas, branchId: 2, branchName: 'Cochabamba' }],
      items: [
        {
          id: 9, branchId: 2, branchName: 'Cochabamba', branchActive: true, productId: 3, productName: 'Blazer',
          productActive: false, sizeName: 'M', colorName: 'Negro', physical: 4, reserved: 1, available: 3, incoming: 6, lowStock: true,
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    expect(inv.resumen).toMatchObject({ variantes: 1, disponible: 3, entrante: 6, stock_bajo: 1 });
    expect(inv.items[0]).toMatchObject({ producto: 'Blazer', producto_activo: false, disponible: 3, stock_bajo: true });

    const reservas = adaptarReservasPorEstado({
      period: periodo,
      items: [
        { branchId: 1, branchName: 'La Paz', status: 'PENDING', count: 2 },
        { branchId: 2, branchName: 'Cochabamba', status: 'PENDING', count: 1 },
        { branchId: 2, branchName: 'Cochabamba', status: 'EXPIRED', count: 4 },
      ],
    });
    expect(reservas).toHaveLength(7);
    expect(reservas.find((r) => r.estado === 'PENDIENTE')?.cantidad).toBe(3);
    expect(reservas.find((r) => r.estado === 'VENCIDA')?.cantidad).toBe(4);
    expect(reservas.find((r) => r.estado === 'LISTA')?.cantidad).toBe(0);
  });
});
