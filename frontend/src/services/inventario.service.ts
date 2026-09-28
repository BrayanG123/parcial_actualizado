import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { disponibilidadService } from './disponibilidad.service';
import { endpoints } from '../api/endpoints';
import { endpoints as mocks } from '../mocks/endpoints';
import {
  adaptarPagina,
  paginarEnMemoria,
  todasLasPaginas,
  type PaginaBackend,
} from '../api/contratos';
import {
  adaptarInventario,
  adaptarMovimiento,
  TIPOS_MOVIMIENTO,
  type InventarioBackend,
  type MovimientoBackend,
  type ResultadoMovimientoBackend,
  type TipoMovimientoBackend,
} from '../api/inventario.contratos';
import { ErrorApi, type Paginado, type ParamsPaginacion } from '../types/api';
import { TipoMovimiento, type Inventario, type MovimientoInventario } from '../types/domain';
import { stockDisponible } from '../lib/domain';

export interface FiltrosInventario extends ParamsPaginacion {
  q?: string;
  id_sucursal?: number;
  id_producto?: number;
  solo_criticos?: boolean;
  umbral?: number;
}
export interface ConsultaDisponibilidad {
  id_producto: number;
  id_talla?: number;
  id_color?: number;
  id_sucursal?: number;
}
export interface DatosMovimiento {
  id_inventario: number;
  tipo: TipoMovimiento;
  cantidad: number;
  referencia?: string;
  observacion?: string;
  fecha_programada?: string | null;
}
export interface DatosEntrada {
  id_sucursal: number;
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
  pendiente?: boolean;
  fecha_programada?: string | null;
  referencia?: string;
  observacion?: string;
}
export interface FiltrosMovimiento extends ParamsPaginacion {
  id_inventario: number;
  tipo?: TipoMovimiento;
  estado?: 'PENDIENTE' | 'COMPLETADO' | 'CANCELADO';
}
function resultado(v: ResultadoMovimientoBackend) {
  return { ...adaptarMovimiento(v.movement), inventario: adaptarInventario(v.inventory) };
}
function validarCantidad(cantidad: number, ajuste = false) {
  if (!Number.isInteger(cantidad) || cantidad < (ajuste ? 0 : 1))
    throw new ErrorApi(
      ajuste
        ? 'El stock final debe ser un entero mayor o igual a cero.'
        : 'La cantidad debe ser un entero mayor a cero.',
      400,
    );
}
export const inventarioService = {
  async listar(f: FiltrosInventario = {}): Promise<Paginado<Inventario>> {
    if (USAR_MOCKS) return api.get<Paginado<Inventario>>(mocks.inventario.lista, f);
    const cargar = (page: number, limit: number) =>
      api.get<PaginaBackend<InventarioBackend>>(endpoints.inventario.lista, {
        page,
        limit,
        branchId: f.id_sucursal,
        productId: f.id_producto,
      });
    if (!f.q?.trim() && !f.solo_criticos)
      return adaptarPagina(await cargar(f.page ?? 1, f.page_size ?? 20), adaptarInventario);
    // El backend restringe primero a la sucursal autorizada. No filtrar solo una pagina.
    let items = (await todasLasPaginas(cargar)).map(adaptarInventario);
    if (f.q?.trim())
      items = items.filter((i) =>
        i.producto?.nombre.toLocaleLowerCase().includes(f.q!.trim().toLocaleLowerCase()),
      );
    if (f.solo_criticos)
      items = items
        .filter((i) => stockDisponible(i) <= (f.umbral ?? 3))
        .sort(
          (a, b) => stockDisponible(a) - stockDisponible(b) || a.id_inventario - b.id_inventario,
        );
    return paginarEnMemoria(items, f);
  },
  async obtener(id: number): Promise<Inventario> {
    return USAR_MOCKS
      ? api.get<Inventario>(mocks.inventario.detalle(id))
      : adaptarInventario(await api.get<InventarioBackend>(endpoints.inventario.detalle(id)));
  },
  disponibilidad: disponibilidadService.listar,
  async movimientos(f: FiltrosMovimiento): Promise<Paginado<MovimientoInventario>> {
    if (USAR_MOCKS) return api.get<Paginado<MovimientoInventario>>(mocks.inventario.movimientos, f);
    const type = (Object.keys(TIPOS_MOVIMIENTO) as TipoMovimientoBackend[]).find(
      (key) => TIPOS_MOVIMIENTO[key] === f.tipo,
    );
    return adaptarPagina(
      await api.get<PaginaBackend<MovimientoBackend>>(
        endpoints.inventario.movimientos(f.id_inventario),
        {
          page: f.page ?? 1,
          limit: f.page_size ?? 20,
          type,
          status: f.estado
            ? { PENDIENTE: 'PENDING', COMPLETADO: 'COMPLETED', CANCELADO: 'CANCELLED' }[f.estado]
            : undefined,
        },
      ),
      adaptarMovimiento,
    );
  },
  async registrarEntrada(d: DatosEntrada): Promise<MovimientoInventario> {
    validarCantidad(d.cantidad);
    if (
      d.pendiente &&
      (!d.fecha_programada ||
        !Number.isFinite(Date.parse(d.fecha_programada)) ||
        Date.parse(d.fecha_programada) <= Date.now())
    )
      throw new ErrorApi('Indica una fecha y hora futura para el ingreso programado.', 400);
    if (USAR_MOCKS) return api.post<MovimientoInventario>(mocks.inventario.entradas, d);
    return resultado(
      await api.post<ResultadoMovimientoBackend>(endpoints.inventario.entradas, {
        branchId: d.id_sucursal,
        productId: d.id_producto,
        sizeId: d.id_talla,
        colorId: d.id_color,
        quantity: d.cantidad,
        status: d.pendiente ? 'PENDING' : 'COMPLETED',
        scheduledAt: d.pendiente ? d.fecha_programada : undefined,
        reference: d.referencia,
        observation: d.observacion,
      }),
    );
  },
  async registrarMovimiento(d: DatosMovimiento): Promise<MovimientoInventario> {
    validarCantidad(d.cantidad, d.tipo === TipoMovimiento.AJUSTE);
    if (
      ![
        TipoMovimiento.ENTRADA,
        TipoMovimiento.INGRESO_PENDIENTE,
        TipoMovimiento.AJUSTE,
        TipoMovimiento.DEVOLUCION,
      ].some((t) => t === d.tipo)
    )
      throw new ErrorApi('Este movimiento se genera desde su operacion de venta o reserva.', 400);
    if (
      (d.tipo === TipoMovimiento.AJUSTE || d.tipo === TipoMovimiento.DEVOLUCION) &&
      !d.observacion?.trim()
    )
      throw new ErrorApi('Explica el motivo del ajuste o la devolucion.', 400);
    if (d.tipo === TipoMovimiento.ENTRADA || d.tipo === TipoMovimiento.INGRESO_PENDIENTE) {
      const inv = await inventarioService.obtener(d.id_inventario);
      return inventarioService.registrarEntrada({
        ...inv,
        ...d,
        pendiente: d.tipo === TipoMovimiento.INGRESO_PENDIENTE,
      });
    }
    if (USAR_MOCKS) return api.post<MovimientoInventario>(mocks.inventario.crearMovimiento, d);
    const url =
      d.tipo === TipoMovimiento.AJUSTE
        ? endpoints.inventario.ajustes(d.id_inventario)
        : endpoints.inventario.devoluciones(d.id_inventario);
    return resultado(
      await api.post<ResultadoMovimientoBackend>(url, {
        ...(d.tipo === TipoMovimiento.AJUSTE
          ? { physicalQuantity: d.cantidad }
          : { quantity: d.cantidad }),
        reference: d.referencia,
        observation: d.observacion,
      }),
    );
  },
  async completarEntrada(id: number): Promise<MovimientoInventario> {
    if (USAR_MOCKS) return api.post<MovimientoInventario>(mocks.inventario.completar(id));
    return resultado(
      await api.post<ResultadoMovimientoBackend>(endpoints.inventario.completar(id)),
    );
  },
};
