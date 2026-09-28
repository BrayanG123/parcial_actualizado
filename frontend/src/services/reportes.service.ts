/**
 * Indicadores y reportes. NestJS calcula los agregados y limita al encargado
 * a su sucursal; aqui solo se traducen filtros y respuestas.
 *   GET /reports/sales
 *   GET /reports/top-products
 *   GET /reports/inventory
 *   GET /reports/reservations
 */
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import {
  adaptarReporteCaja,
  type ReporteCajaBackend,
  adaptarReporteInventario,
  adaptarReporteVentas,
  adaptarReservasPorEstado,
  adaptarTopProductos,
  filtrosInventarioApi,
  filtrosReporteApi,
  type ReporteInventarioBackend,
  type ReporteReservasBackend,
  type ReporteVentasBackend,
  type TopProductosBackend,
} from '../api/reportes.contratos';
import type { FiltroInventarioReporte, FiltroReporte } from '../types/reportes';

export const reportesService = {
  async ventas(filtros: FiltroReporte = {}) {
    return adaptarReporteVentas(
      await api.get<ReporteVentasBackend>(endpoints.reportes.ventas, filtrosReporteApi(filtros)),
    );
  },
  async topProductos(filtros: FiltroReporte & { limite?: number } = {}) {
    const { limite, ...resto } = filtros;
    return adaptarTopProductos(
      await api.get<TopProductosBackend>(endpoints.reportes.topProductos, {
        ...filtrosReporteApi(resto),
        limit: limite,
      }),
    );
  },
  async inventario(filtros: FiltroInventarioReporte = {}) {
    return adaptarReporteInventario(
      await api.get<ReporteInventarioBackend>(
        endpoints.reportes.inventario,
        filtrosInventarioApi(filtros),
      ),
    );
  },
  async caja(filtros: FiltroReporte & { id_caja?: number } = {}) {
    const { canal: _canal, id_caja, ...resto } = filtros;
    const { channel: _channel, ...params } = filtrosReporteApi(resto);
    return adaptarReporteCaja(
      await api.get<ReporteCajaBackend>(endpoints.reportes.caja, { ...params, registerId: id_caja }),
    );
  },
  async reservasPorEstado(filtros: FiltroReporte = {}) {
    const { canal: _canal, ...resto } = filtros;
    const { channel: _channel, ...params } = filtrosReporteApi(resto);
    return adaptarReservasPorEstado(
      await api.get<ReporteReservasBackend>(endpoints.reportes.reservas, params),
    );
  },
};
