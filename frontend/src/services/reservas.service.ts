import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { endpoints as mocks } from '../mocks/endpoints';
import { adaptarPagina, type PaginaBackend } from '../api/contratos';
import {
  adaptarReserva,
  ESTADOS_RESERVA,
  type EstadoReservaBackend,
  type ReservaBackend,
} from '../api/reservas.contratos';
import { ErrorApi, type Paginado } from '../types/api';
import type { EstadoReserva, Reserva } from '../types/domain';
import type { DatosReserva, FiltrosReserva } from './comercio.service';
function estadoApi(estado: EstadoReserva) {
  const valor = (Object.keys(ESTADOS_RESERVA) as EstadoReservaBackend[]).find(
    (key) => ESTADOS_RESERVA[key] === estado,
  );
  if (!valor) throw new ErrorApi('Estado de reserva desconocido.', 400);
  return valor;
}
async function listar(f: FiltrosReserva, propias: boolean): Promise<Paginado<Reserva>> {
  if (USAR_MOCKS) return api.get<Paginado<Reserva>>(mocks.reservas.lista, { ...f, propias });
  return adaptarPagina(
    await api.get<PaginaBackend<ReservaBackend>>(
      propias ? endpoints.reservas.propias : endpoints.reservas.lista,
      {
        page: f.page ?? 1,
        limit: f.page_size ?? 20,
        branchId: f.id_sucursal,
        status: f.estado ? estadoApi(f.estado) : undefined,
      },
    ),
    adaptarReserva,
  );
}
export function validarReserva(d: DatosReserva) {
  if (!Number.isInteger(d.id_sucursal) || d.id_sucursal < 1)
    throw new ErrorApi('Selecciona una sucursal.', 400);
  if (
    !/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(d.horario_aproximado) ||
    !Number.isFinite(Date.parse(d.horario_aproximado)) ||
    Date.parse(d.horario_aproximado) <= Date.now()
  )
    throw new ErrorApi('Indica una fecha y hora futura para la visita.', 400);
  if (d.detalles.length < 1 || d.detalles.length > 50)
    throw new ErrorApi('La reserva admite entre 1 y 50 variantes.', 400);
  const claves = new Set<string>();
  for (const i of d.detalles) {
    if (
      ![i.id_producto, i.id_talla, i.id_color, i.cantidad].every(
        (n) => Number.isInteger(n) && n > 0,
      ) ||
      i.cantidad > 100
    )
      throw new ErrorApi(
        'Selecciona variantes validas y entre 1 y 100 unidades por variante.',
        400,
      );
    const clave = `${i.id_producto}:${i.id_talla}:${i.id_color}`;
    if (claves.has(clave))
      throw new ErrorApi('No repitas una prenda con la misma talla y color.', 400);
    claves.add(clave);
  }
  if ((d.observacion?.length ?? 0) > 500)
    throw new ErrorApi('La observacion admite hasta 500 caracteres.', 400);
}
export const reservasService = {
  listar: (f: FiltrosReserva = {}) => listar(f, false),
  propias: (f: FiltrosReserva = {}) => listar(f, true),
  async obtener(id: number): Promise<Reserva> {
    return USAR_MOCKS
      ? api.get<Reserva>(mocks.reservas.detalle(id))
      : adaptarReserva(await api.get<ReservaBackend>(endpoints.reservas.detalle(id)));
  },
  async crear(d: DatosReserva): Promise<Reserva> {
    validarReserva(d);
    return USAR_MOCKS
      ? api.post<Reserva>(mocks.reservas.crear, d)
      : adaptarReserva(
          await api.post<ReservaBackend>(endpoints.reservas.crear, {
            branchId: d.id_sucursal,
            approximateTime: d.horario_aproximado,
            observation: d.observacion,
            items: d.detalles.map((i) => ({
              productId: i.id_producto,
              sizeId: i.id_talla,
              colorId: i.id_color,
              quantity: i.cantidad,
            })),
          }),
        );
  },
  async cambiarEstado(id: number, estado: EstadoReserva): Promise<Reserva> {
    const status = estadoApi(estado);
    if (status === 'PENDING' || status === 'EXPIRED')
      throw new ErrorApi('Este estado lo establece automaticamente el sistema.', 400);
    return USAR_MOCKS
      ? api.patch<Reserva>(mocks.reservas.estado(id), { estado })
      : adaptarReserva(await api.patch<ReservaBackend>(endpoints.reservas.estado(id), { status }));
  },
  async cancelar(id: number): Promise<Reserva> {
    return USAR_MOCKS
      ? api.post<Reserva>(mocks.reservas.cancelar(id))
      : adaptarReserva(await api.patch<ReservaBackend>(endpoints.reservas.cancelar(id)));
  },
};
