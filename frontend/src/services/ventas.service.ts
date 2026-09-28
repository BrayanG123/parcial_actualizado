import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { endpoints as mocks } from '../mocks/endpoints';
import { adaptarPagina, type PaginaBackend } from '../api/contratos';
import { adaptarVenta, CANALES_API, type VentaBackend } from '../api/ventas.contratos';
import { ErrorApi, type Paginado } from '../types/api';
import type { Venta } from '../types/domain';
import type { DatosVenta, FiltrosVenta } from './comercio.service';

export function filtrosVentasApi(f: FiltrosVenta) {
  if (f.desde && f.hasta && f.desde > f.hasta)
    throw new ErrorApi('La fecha final debe ser igual o posterior a la inicial.', 400);
  return {
    page: f.page ?? 1,
    limit: f.page_size ?? 20,
    branchId: f.id_sucursal,
    channel: f.canal ? CANALES_API[f.canal] : undefined,
    from: f.desde ? `${f.desde}T00:00:00.000-04:00` : undefined,
    to: f.hasta ? `${f.hasta}T23:59:59.999-04:00` : undefined,
  };
}
async function listar(f: FiltrosVenta = {}, propias = false): Promise<Paginado<Venta>> {
  if (USAR_MOCKS) return api.get<Paginado<Venta>>(mocks.ventas.lista, f);
  return adaptarPagina(
    await api.get<PaginaBackend<VentaBackend>>(
      propias ? endpoints.ventas.propias : endpoints.ventas.lista,
      filtrosVentasApi(f),
    ),
    adaptarVenta,
  );
}
export const ventasService = {
  listar,
  propias: (f: FiltrosVenta = {}) => listar(f, true),
  obtener: async (id: number) =>
    USAR_MOCKS
      ? api.get<Venta>(mocks.ventas.detalle(id))
      : adaptarVenta(await api.get<VentaBackend>(endpoints.ventas.detalle(id))),
  comprobante: async (id: number) =>
    USAR_MOCKS
      ? api.get<Venta>(mocks.ventas.detalle(id))
      : adaptarVenta(await api.get<VentaBackend>(endpoints.ventas.comprobante(id))),
  registrar: (datos: DatosVenta) => {
    if (USAR_MOCKS) return api.post<Venta>(mocks.ventas.crear, datos);
    throw new ErrorApi(
      'Usa la revision y confirmacion de la caja para registrar una venta presencial.',
      400,
    );
  },
};
