import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { endpoints as mocks } from '../mocks/endpoints';
import { adaptarCarrito, type CarritoBackend } from '../api/carrito.contratos';
import { ErrorApi } from '../types/api';
import type { Carrito } from '../types/domain';
import type { LineaSeleccion } from './comercio.service';
function cantidadValida(cantidad: number) {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100)
    throw new ErrorApi('La cantidad debe ser un entero entre 1 y 100.', 400);
}
export const carritoService = {
  async obtener(): Promise<Carrito> {
    return USAR_MOCKS
      ? api.get<Carrito>(mocks.carrito.actual)
      : adaptarCarrito(await api.get<CarritoBackend>(endpoints.carrito.actual));
  },
  async agregar(d: LineaSeleccion): Promise<Carrito> {
    cantidadValida(d.cantidad);
    return USAR_MOCKS
      ? api.post<Carrito>(mocks.carrito.items, d)
      : adaptarCarrito(
          await api.post<CarritoBackend>(endpoints.carrito.items, {
            productId: d.id_producto,
            sizeId: d.id_talla,
            colorId: d.id_color,
            quantity: d.cantidad,
          }),
        );
  },
  async cambiarCantidad(id: number, cantidad: number): Promise<Carrito> {
    cantidadValida(cantidad);
    return USAR_MOCKS
      ? api.patch<Carrito>(mocks.carrito.item(id), { cantidad })
      : adaptarCarrito(
          await api.patch<CarritoBackend>(endpoints.carrito.item(id), { quantity: cantidad }),
        );
  },
  async quitar(id: number): Promise<Carrito> {
    return USAR_MOCKS
      ? api.delete<Carrito>(mocks.carrito.item(id))
      : adaptarCarrito(await api.delete<CarritoBackend>(endpoints.carrito.item(id)));
  },
  async vaciar(): Promise<Carrito> {
    return USAR_MOCKS
      ? api.delete<Carrito>(mocks.carrito.vaciar)
      : adaptarCarrito(await api.delete<CarritoBackend>(endpoints.carrito.vaciar));
  },
};
