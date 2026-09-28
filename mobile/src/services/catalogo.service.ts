/**
 * Catalogo y disponibilidad (publicos).
 *   GET /products, /products/:id, /products/:id/ar-resources
 *   GET /catalog/categories | sizes | colors | seasons | collections
 *   GET /branches, /inventory/availability
 * /products no ordena ni filtra por promocion o sucursal: esos filtros se
 * aplican sobre el catalogo completo antes de paginar.
 */
import { api, USAR_MOCKS } from '../api/http';
import { endpoints } from '../api/endpoints';
import {
  adaptarCategoria,
  adaptarColeccion,
  adaptarColor,
  adaptarDisponibilidad,
  adaptarProducto,
  adaptarRecurso,
  adaptarSucursal,
  adaptarTalla,
  adaptarTemporada,
  type CategoriaBackend,
  type ColeccionBackend,
  type ColorBackend,
  type DisponibilidadBackend,
  type NombreBackend,
  type ProductoBackend,
  type RecursoBackend,
  type SucursalBackend,
  type TemporadaBackend,
} from '../api/catalogo.contratos';
import { adaptarPagina, paginarEnMemoria, todasLasPaginas, type PaginaBackend } from '../api/contratos';
import { precioActual, promocionVigente, stockDisponible } from '../lib/domain';
import { rutasMock } from '../mocks/endpoints';
import type { Paginado, ParamsPaginacion } from '../types/api';
import type {
  Categoria,
  Coleccion,
  Color,
  Inventario,
  Producto,
  RecursoRA,
  Sucursal,
  Talla,
  Temporada,
} from '../types/domain';

export type OrdenCatalogo = 'precio_asc' | 'precio_desc' | 'nombre' | 'descuento';

export interface FiltrosProducto extends ParamsPaginacion {
  q?: string;
  id_categoria?: number;
  id_talla?: number;
  id_color?: number;
  id_coleccion?: number;
  id_temporada?: number;
  id_sucursal?: number;
  precio_min?: number;
  precio_max?: number;
  solo_promocion?: boolean;
  solo_disponibles?: boolean;
  orden?: OrdenCatalogo;
}

export interface ConsultaDisponibilidad {
  id_producto: number;
  id_talla?: number;
  id_color?: number;
  id_sucursal?: number;
}

async function disponibilidad(c: Partial<ConsultaDisponibilidad>): Promise<Inventario[]> {
  const filas = await todasLasPaginas((page, limit) =>
    api.get<PaginaBackend<DisponibilidadBackend>>(endpoints.inventario.disponibilidad, {
      page,
      limit,
      productId: c.id_producto,
      branchId: c.id_sucursal,
      sizeId: c.id_talla,
      colorId: c.id_color,
    }),
  );
  return filas.map(adaptarDisponibilidad);
}

async function listarProductos(f: FiltrosProducto = {}): Promise<Paginado<Producto>> {
  const filtros = {
    search: f.q,
    categoryId: f.id_categoria,
    sizeId: f.id_talla,
    colorId: f.id_color,
    seasonId: f.id_temporada,
    collectionId: f.id_coleccion,
    minPrice: f.precio_min,
    maxPrice: f.precio_max,
  };
  const pagina = (page: number, limit: number) =>
    api.get<PaginaBackend<ProductoBackend>>(endpoints.catalogo.productos, { ...filtros, page, limit });

  if (!f.solo_promocion && !f.orden && !f.id_sucursal && !f.solo_disponibles) {
    return adaptarPagina(await pagina(f.page ?? 1, f.page_size ?? 20), adaptarProducto);
  }
  let productos = (await todasLasPaginas(pagina)).map(adaptarProducto);
  if (f.solo_promocion) productos = productos.filter((p) => promocionVigente(p));
  if (f.id_sucursal || f.solo_disponibles) {
    const stock = await disponibilidad({ id_sucursal: f.id_sucursal, id_talla: f.id_talla, id_color: f.id_color });
    const conStock = new Set(stock.filter((i) => stockDisponible(i) > 0).map((i) => i.id_producto));
    productos = productos.filter((p) => conStock.has(p.id_producto));
  }
  productos.sort((a, b) => {
    let orden = 0;
    if (f.orden === 'nombre') orden = a.nombre.localeCompare(b.nombre, 'es');
    if (f.orden === 'precio_asc') orden = precioActual(a) - precioActual(b);
    if (f.orden === 'precio_desc') orden = precioActual(b) - precioActual(a);
    if (f.orden === 'descuento')
      orden = (promocionVigente(b) ? b.descuento_pct : 0) - (promocionVigente(a) ? a.descuento_pct : 0);
    return orden || b.id_producto - a.id_producto;
  });
  return paginarEnMemoria(productos, f);
}

const real = {
  listarProductos,
  obtenerProducto: async (id: number) =>
    adaptarProducto(await api.get<ProductoBackend>(endpoints.catalogo.producto(id))),
  recursosRA: async (idProducto: number): Promise<RecursoRA[]> =>
    (await api.get<RecursoBackend[]>(endpoints.catalogo.recursosRA(idProducto))).map(adaptarRecurso),
  listarCategorias: async (): Promise<Categoria[]> =>
    (await api.get<CategoriaBackend[]>(endpoints.catalogo.categorias)).map(adaptarCategoria),
  listarTallas: async (): Promise<Talla[]> =>
    (await api.get<NombreBackend[]>(endpoints.catalogo.tallas)).map(adaptarTalla),
  listarColores: async (): Promise<Color[]> =>
    (await api.get<ColorBackend[]>(endpoints.catalogo.colores)).map(adaptarColor),
  listarTemporadas: async (): Promise<Temporada[]> =>
    (await api.get<TemporadaBackend[]>(endpoints.catalogo.temporadas)).map(adaptarTemporada),
  listarColecciones: async (): Promise<Coleccion[]> =>
    (await api.get<ColeccionBackend[]>(endpoints.catalogo.colecciones)).map(adaptarColeccion),
  listarSucursales: async (): Promise<Sucursal[]> =>
    (
      await todasLasPaginas((page, limit) =>
        api.get<PaginaBackend<SucursalBackend>>(endpoints.sucursales.lista, { page, limit }),
      )
    )
      .map(adaptarSucursal)
      .filter((s) => s.activa),
  disponibilidad: (consulta: ConsultaDisponibilidad) => disponibilidad(consulta),
};

const mock: typeof real = {
  listarProductos: (filtros = {}) => api.get<Paginado<Producto>>(rutasMock.productos, filtros),
  obtenerProducto: (id) => api.get<Producto>(rutasMock.producto(id)),
  recursosRA: (id) => api.get<RecursoRA[]>(rutasMock.recursosRA(id)),
  listarCategorias: () => api.get<Categoria[]>(rutasMock.categorias),
  listarTallas: () => api.get<Talla[]>(rutasMock.tallas),
  listarColores: () => api.get<Color[]>(rutasMock.colores),
  listarTemporadas: () => api.get<Temporada[]>(rutasMock.temporadas),
  listarColecciones: () => api.get<Coleccion[]>(rutasMock.colecciones),
  listarSucursales: () => api.get<Sucursal[]>(rutasMock.sucursales),
  disponibilidad: (consulta) => api.get<Inventario[]>(rutasMock.disponibilidad, consulta),
};

export const catalogoService = USAR_MOCKS ? mock : real;
