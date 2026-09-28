import { precioActual, promocionVigente, stockDisponible } from '../../lib/domain';
import type { Producto } from '../../types/domain';
import {
  categorias,
  colecciones,
  colores,
  inventario,
  productos,
  proveedores,
  recursosRA,
  siguienteId,
  sucursales,
  tallas,
  temporadas,
} from '../db';
import { expandirProducto, noEncontrado, num, paginar, texto, type RutaMock } from '../core';
import { rutasCrud } from './crud';

function filtrarProductos(params: Record<string, unknown>): Producto[] {
  const q = texto(params.q);
  const idCategoria = num(params.id_categoria);
  const idTalla = num(params.id_talla);
  const idColor = num(params.id_color);
  const idColeccion = num(params.id_coleccion);
  const idTemporada = num(params.id_temporada);
  const idProveedor = num(params.id_proveedor);
  const idSucursal = num(params.id_sucursal);
  const precioMin = num(params.precio_min);
  const precioMax = num(params.precio_max);
  const soloPromocion = params.solo_promocion === true || params.solo_promocion === 'true';
  const soloDisponibles = params.solo_disponibles === true || params.solo_disponibles === 'true';
  const incluirInactivos = params.incluir_inactivos === true || params.incluir_inactivos === 'true';

  let lista = productos.filter((p) => (incluirInactivos ? true : p.activo));

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
  if (idProveedor) lista = lista.filter((p) => p.id_proveedor === idProveedor);
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
    handler: ({ params }) => {
      const lista = filtrarProductos(params).map(expandirProducto);
      return paginar(lista, params);
    },
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
    metodo: 'POST',
    patron: /^\/productos$/,
    handler: ({ body }) => {
      const idsTalla: number[] = body?.id_tallas ?? [];
      const idsColor: number[] = body?.id_colores ?? [];
      const nuevo: Producto = {
        id_producto: siguienteId('producto'),
        nombre: String(body?.nombre ?? ''),
        descripcion: String(body?.descripcion ?? ''),
        precio: Number(body?.precio ?? 0),
        imagen_url: String(body?.imagen_url ?? ''),
        descuento_pct: Number(body?.descuento_pct ?? 0),
        promo_inicio: body?.promo_inicio ?? null,
        promo_fin: body?.promo_fin ?? null,
        activo: body?.activo ?? true,
        id_categoria: Number(body?.id_categoria ?? 1),
        id_temporada: body?.id_temporada ?? null,
        id_coleccion: body?.id_coleccion ?? null,
        id_proveedor: body?.id_proveedor ?? null,
        tallas: tallas.filter((t) => idsTalla.includes(t.id_talla)),
        colores: colores.filter((c) => idsColor.includes(c.id_color)),
        tiene_recurso_ra: false,
      };
      productos.push(nuevo);
      return expandirProducto(nuevo);
    },
  },
  {
    metodo: 'PUT',
    patron: /^\/productos\/(\d+)$/,
    handler: ({ partes, body }) => {
      const actual = productos.find((x) => x.id_producto === Number(partes[0]));
      if (!actual) noEncontrado('producto');
      const { id_tallas, id_colores, ...resto } = body ?? {};
      Object.assign(actual, resto, { id_producto: actual.id_producto });
      if (Array.isArray(id_tallas)) actual.tallas = tallas.filter((t) => id_tallas.includes(t.id_talla));
      if (Array.isArray(id_colores)) actual.colores = colores.filter((c) => id_colores.includes(c.id_color));
      return expandirProducto(actual);
    },
  },
  {
    metodo: 'DELETE',
    patron: /^\/productos\/(\d+)$/,
    handler: ({ partes }) => {
      const actual = productos.find((x) => x.id_producto === Number(partes[0]));
      if (!actual) noEncontrado('producto');
      actual.activo = false; // baja logica, no se borra historial de ventas
      return { ok: true };
    },
  },
  {
    metodo: 'GET',
    patron: /^\/productos\/(\d+)\/recursos-ra$/,
    handler: ({ partes }) =>
      recursosRA.filter((r) => r.id_producto === Number(partes[0]) && r.activo),
  },

  ...rutasCrud({ ruta: 'categorias', coleccion: categorias, campoId: 'id_categoria', secuencia: 'categoria', camposBusqueda: ['nombre', 'descripcion'] }),
  ...rutasCrud({ ruta: 'tallas', coleccion: tallas, campoId: 'id_talla', secuencia: 'talla', camposBusqueda: ['nombre'] }),
  ...rutasCrud({ ruta: 'colores', coleccion: colores, campoId: 'id_color', secuencia: 'color', camposBusqueda: ['nombre'] }),
  ...rutasCrud({ ruta: 'temporadas', coleccion: temporadas, campoId: 'id_temporada', secuencia: 'temporada', camposBusqueda: ['nombre'], porDefecto: { activa: true } }),
  ...rutasCrud({ ruta: 'colecciones', coleccion: colecciones, campoId: 'id_coleccion', secuencia: 'coleccion', camposBusqueda: ['nombre', 'descripcion'], porDefecto: { activa: true } }),
  ...rutasCrud({ ruta: 'proveedores', coleccion: proveedores, campoId: 'id_proveedor', secuencia: 'proveedor', camposBusqueda: ['nombre', 'contacto', 'email'], porDefecto: { activo: true } }),
  ...rutasCrud({ ruta: 'sucursales', coleccion: sucursales, campoId: 'id_sucursal', secuencia: 'sucursal', camposBusqueda: ['nombre', 'ciudad', 'direccion'], porDefecto: { activa: true } }),

  {
    metodo: 'GET',
    patron: /^\/proveedores\/(\d+)\/productos$/,
    handler: ({ partes }) =>
      productos.filter((p) => p.id_proveedor === Number(partes[0])).map(expandirProducto),
  },
];
