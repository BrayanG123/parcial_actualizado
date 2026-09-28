/**
 * Disponibilidad. El cliente movil solo consulta stock por
 * producto + talla + color + sucursal; no mueve inventario.
 */
import { inventario } from '../db';
import { expandirInventario, invalido, num, type RutaMock } from '../core';

export const rutasInventario: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/inventario\/disponibilidad$/,
    handler: ({ params }) => {
      const idProducto = num(params.id_producto);
      if (!idProducto) invalido('Debes indicar el producto para consultar disponibilidad.');
      const idTalla = num(params.id_talla);
      const idColor = num(params.id_color);
      const idSucursal = num(params.id_sucursal);

      return inventario
        .filter(
          (i) =>
            i.id_producto === idProducto &&
            (!idTalla || i.id_talla === idTalla) &&
            (!idColor || i.id_color === idColor) &&
            (!idSucursal || i.id_sucursal === idSucursal),
        )
        .map(expandirInventario);
    },
  },
];
