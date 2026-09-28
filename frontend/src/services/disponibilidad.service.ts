import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { endpoints as mocks } from '../mocks/endpoints';
import { todasLasPaginas, type PaginaBackend } from '../api/contratos';
import { adaptarDisponibilidad, type DisponibilidadBackend } from '../api/catalogo.contratos';
import type { Disponibilidad, Inventario } from '../types/domain';

export interface FiltroDisponibilidad {
  id_producto?: number;
  id_sucursal?: number;
  id_talla?: number;
  id_color?: number;
}
export const disponibilidadService = {
  async listar(f: FiltroDisponibilidad): Promise<Disponibilidad[]> {
    if (USAR_MOCKS)
      return (await api.get<Inventario[]>(mocks.inventario.disponibilidad, f)).map((i) => ({
        ...i,
        cantidad_disponible: i.cantidad_fisica - i.cantidad_reservada,
      }));
    const items = await todasLasPaginas((page, limit) =>
      api.get<PaginaBackend<DisponibilidadBackend>>(endpoints.inventario.disponibilidad, {
        page,
        limit,
        productId: f.id_producto,
        branchId: f.id_sucursal,
        sizeId: f.id_talla,
        colorId: f.id_color,
      }),
    );
    return items.map(adaptarDisponibilidad);
  },
};
