/**
 * Carrito, reservas y compras del cliente autenticado.
 *   GET/POST/PATCH/DELETE /cart, /cart/items[/:id]
 *   GET /reservations/mine, GET /reservations/:id, POST /reservations, PATCH /reservations/:id/cancel
 *   GET /sales/mine, GET /sales/:id
 */
import { api, USAR_MOCKS } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarPagina, type PaginaBackend } from '../api/contratos';
import {
  adaptarCarrito,
  adaptarReserva,
  adaptarVenta,
  CANALES_API,
  estadoReservaApi,
  type CarritoBackend,
  type ReservaBackend,
  type VentaBackend,
} from '../api/comercio.contratos';
import { rutasMock } from '../mocks/endpoints';
import { ErrorApi, type Paginado, type ParamsPaginacion } from '../types/api';
import type { CanalVenta, Carrito, EstadoReserva, Reserva, Venta } from '../types/domain';

export interface LineaSeleccion {
  id_producto: number;
  id_talla: number;
  id_color: number;
  cantidad: number;
}

export interface DatosReserva {
  id_sucursal: number;
  horario_aproximado: string;
  observacion?: string;
  detalles: LineaSeleccion[];
}

export interface FiltrosReserva extends ParamsPaginacion {
  estado?: EstadoReserva;
}

export interface FiltrosVenta extends ParamsPaginacion {
  canal?: CanalVenta;
}

function cantidadValida(cantidad: number) {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100)
    throw new ErrorApi('La cantidad debe estar entre 1 y 100 unidades.', 400);
}

const variante = (l: LineaSeleccion) => ({
  productId: l.id_producto,
  sizeId: l.id_talla,
  colorId: l.id_color,
  quantity: l.cantidad,
});

export const carritoService = {
  async obtener(): Promise<Carrito> {
    if (USAR_MOCKS) return api.get<Carrito>(rutasMock.carrito.actual);
    return adaptarCarrito(await api.get<CarritoBackend>(endpoints.carrito.actual));
  },
  async agregar(linea: LineaSeleccion): Promise<Carrito> {
    cantidadValida(linea.cantidad);
    if (USAR_MOCKS) return api.post<Carrito>(rutasMock.carrito.items, linea);
    return adaptarCarrito(await api.post<CarritoBackend>(endpoints.carrito.items, variante(linea)));
  },
  async cambiarCantidad(idDetalle: number, cantidad: number): Promise<Carrito> {
    cantidadValida(cantidad);
    if (USAR_MOCKS) return api.patch<Carrito>(rutasMock.carrito.item(idDetalle), { cantidad });
    return adaptarCarrito(await api.patch<CarritoBackend>(endpoints.carrito.item(idDetalle), { quantity: cantidad }));
  },
  async quitar(idDetalle: number): Promise<Carrito> {
    if (USAR_MOCKS) return api.delete<Carrito>(rutasMock.carrito.item(idDetalle));
    return adaptarCarrito(await api.delete<CarritoBackend>(endpoints.carrito.item(idDetalle)));
  },
  async vaciar(): Promise<Carrito> {
    if (USAR_MOCKS) return api.delete<Carrito>(rutasMock.carrito.vaciar);
    return adaptarCarrito(await api.delete<CarritoBackend>(endpoints.carrito.vaciar));
  },
};

export const reservasService = {
  async listar(filtros: FiltrosReserva = {}): Promise<Paginado<Reserva>> {
    if (USAR_MOCKS) return api.get<Paginado<Reserva>>(rutasMock.reservas.lista, filtros);
    return adaptarPagina(
      await api.get<PaginaBackend<ReservaBackend>>(endpoints.reservas.propias, {
        page: filtros.page ?? 1,
        limit: filtros.page_size ?? 20,
        status: filtros.estado ? estadoReservaApi(filtros.estado) : undefined,
      }),
      adaptarReserva,
    );
  },
  async obtener(id: number): Promise<Reserva> {
    if (USAR_MOCKS) return api.get<Reserva>(rutasMock.reservas.detalle(id));
    return adaptarReserva(await api.get<ReservaBackend>(endpoints.reservas.detalle(id)));
  },
  async crear(datos: DatosReserva): Promise<Reserva> {
    if (Date.parse(datos.horario_aproximado) <= Date.now())
      throw new ErrorApi('Elige un horario de visita que todavia no haya pasado.', 400);
    if (USAR_MOCKS) return api.post<Reserva>(rutasMock.reservas.lista, datos);
    return adaptarReserva(
      await api.post<ReservaBackend>(endpoints.reservas.crear, {
        branchId: datos.id_sucursal,
        approximateTime: datos.horario_aproximado,
        observation: datos.observacion || undefined,
        items: datos.detalles.map(variante),
      }),
    );
  },
  async cancelar(id: number): Promise<Reserva> {
    if (USAR_MOCKS) return api.post<Reserva>(rutasMock.reservas.cancelar(id));
    return adaptarReserva(await api.patch<ReservaBackend>(endpoints.reservas.cancelar(id)));
  },
};

export const ventasService = {
  async listar(filtros: FiltrosVenta = {}): Promise<Paginado<Venta>> {
    if (USAR_MOCKS) return api.get<Paginado<Venta>>(rutasMock.ventas.lista, filtros);
    return adaptarPagina(
      await api.get<PaginaBackend<VentaBackend>>(endpoints.ventas.propias, {
        page: filtros.page ?? 1,
        limit: filtros.page_size ?? 20,
        channel: filtros.canal ? CANALES_API[filtros.canal] : undefined,
      }),
      adaptarVenta,
    );
  },
  async obtener(id: number): Promise<Venta> {
    if (USAR_MOCKS) return api.get<Venta>(rutasMock.ventas.detalle(id));
    return adaptarVenta(await api.get<VentaBackend>(endpoints.ventas.detalle(id)));
  },
};
