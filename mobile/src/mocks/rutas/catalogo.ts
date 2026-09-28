/**
 * Catalogo del cliente. La app movil solo consulta: el mantenimiento del
 * catalogo vive en el panel web, no aqui.
 */
import { precioActual, promocionVigente, stockDisponible } from '../../lib/domain';
import type { Producto } from '../../types/domain';
import {
  categorias,
  colecciones,
  colores,
  inventario,
  productos,
  recursosRA,
  sucursales,
  tallas,
  temporadas,
} from '../db';
import { expandirProducto, noEncontrado, num, paginar, texto, type RutaMock } from '../core';

function filtrarProductos(params: Record<string, unknown>): Producto[] {
  const q = texto(params.q);
  const idCategoria = num(params.id_categoria);
  const idTalla = num(params.id_talla);
  const idColor = num(params.id_color);
  const idColeccion = num(params.id_coleccion);
  const idTemporada = num(params.id_temporada);
  const idSucursal = num(params.id_sucursal);
  const precioMin = num(params.precio_min);
  const precioMax = num(params.precio_max);
  const soloPromocion = params.solo_promocion === true || params.solo_promocion === 'true';
  const soloDisponibles = params.solo_disponibles === true || params.solo_disponibles === 'true';

  let lista = productos.filter((p) => p.activo);

  if (q) {
    lista = lista.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        (categorias.find((c) => c.id_categoria === p.id_categoria)?.nombre.toLowerCase() ?? '').includes(q),
    );
  }
  if (idCategoria) lista = lista.filter((p) => p.id_categoria === idCategoria);
  if (idColeccion) lista = lista.filter((p) => p.id_coleccion === idColeccion);
  if (idTemporada) lista = lista.filter((p) => p.id_temporada === idTemporada);
  if (idTalla) lista = lista.filter((p) => p.tallas.some((t) => t.id_talla === idTalla));
  if (idColor) lista = lista.filter((p) => p.colores.some((c) => c.id_color === idColor));
  if (precioMin !== undefined) lista = lista.filter((p) => precioActual(p) >= precioMin);
  if (precioMax !== undefined) lista = lista.filter((p) => precioActual(p) <= precioMax);
  if (soloPromocion) lista = lista.filter((p) => promocionVigente(p));
  if (idSucursal || soloDisponibles) {
    lista = lista.filter((p) =>
      inventario.some(
        (i) =>
          i.id_producto === p.id_producto &&
          (!idSucursal || i.id_sucursal === idSucursal) &&
          stockDisponible(i) > 0,
      ),
    );
  }

  const orden = texto(params.orden);
  if (orden === 'precio_asc') lista = [...lista].sort((a, b) => precioActual(a) - precioActual(b));
  else if (orden === 'precio_desc') lista = [...lista].sort((a, b) => precioActual(b) - precioActual(a));
  else if (orden === 'nombre') lista = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
  else if (orden === 'descuento') lista = [...lista].sort((a, b) => b.descuento_pct - a.descuento_pct);

  return lista;
}

export const rutasCatalogo: RutaMock[] = [
  {
    metodo: 'GET',
    patron: /^\/productos$/,
    handler: ({ params }) => paginar(filtrarProductos(params).map(expandirProducto), params),
  },
  {
    metodo: 'GET',
    patron: /^\/productos\/(\d+)$/,
    handler: ({ partes }) => {
      const p = productos.find((x) => x.id_producto === Number(partes[0]));
      return p ? expandirProducto(p) : noEncontrado('producto');
    },
  },
  {
    metodo: 'GET',
    patron: /^\/productos\/(\d+)\/recursos-ra$/,
    handler: ({ partes }) => recursosRA.filter((r) => r.id_producto === Number(partes[0]) && r.activo),
  },
  { metodo: 'GET', patron: /^\/categorias$/, handler: () => categorias },
  { metodo: 'GET', patron: /^\/tallas$/, handler: () => tallas },
  { metodo: 'GET', patron: /^\/colores$/, handler: () => colores },
  { metodo: 'GET', patron: /^\/temporadas$/, handler: () => temporadas },
  { metodo: 'GET', patron: /^\/colecciones$/, handler: () => colecciones },
  { metodo: 'GET', patron: /^\/sucursales$/, handler: () => sucursales.filter((s) => s.activa) },
  {
    metodo: 'GET',
    patron: /^\/sucursales\/(\d+)$/,
    handler: ({ partes }) => {
      const s = sucursales.find((x) => x.id_sucursal === Number(partes[0]));
      return s ?? noEncontrado('sucursal');
    },
  },
];
