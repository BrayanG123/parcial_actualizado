/** Catalogo real: DTO explicitos y filtros compuestos antes de paginar. */
import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import {
  adaptarPagina,
  todasLasPaginas,
  paginarEnMemoria,
  type PaginaBackend,
} from '../api/contratos';
import {
  adaptarCategoria,
  adaptarColor,
  adaptarColeccion,
  adaptarProducto,
  adaptarTalla,
  adaptarTemporada,
  type CategoriaBackend,
  type ColorBackend,
  type ColeccionBackend,
  type ProductoBackend,
  type NombreBackend,
  type TemporadaBackend,
} from '../api/catalogo.contratos';
import type { ParamsPaginacion } from '../types/api';
import type { Categoria, Coleccion, Color, Talla, Temporada } from '../types/domain';
import { catalogoService as catalogoMock } from '../mocks/servicios/catalogo';
import { disponibilidadService } from './disponibilidad.service';
import { ErrorApi } from '../types/api';

export interface FiltrosProducto extends ParamsPaginacion {
  mayorista?: boolean;
  q?: string;
  id_categoria?: number;
  id_talla?: number;
  id_color?: number;
  id_coleccion?: number;
  id_temporada?: number;
  id_proveedor?: number;
  id_sucursal?: number;
  precio_min?: number;
  precio_max?: number;
  solo_promocion?: boolean;
  solo_disponibles?: boolean;
  incluir_inactivos?: boolean;
  orden?: 'precio_asc' | 'precio_desc' | 'nombre' | 'descuento';
}

export interface DatosProducto {
  imagenes?: string[];
  precio_mayorista?: number | null;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_url: string;
  descuento_pct: number;
  promo_inicio: string | null;
  promo_fin: string | null;
  activo: boolean;
  id_categoria: number;
  id_temporada: number | null;
  id_coleccion: number | null;
  id_proveedor: number | null;
  id_tallas: number[];
  id_colores: number[];
}

/** Nunca enviar relaciones expandidas, ids de UI ni campos no admitidos por el DTO. */
export function productoParaApi(d: Partial<DatosProducto>, crear = false) {
  return {
    name: d.nombre?.trim(),
    description: d.descripcion,
    price: d.precio,
    wholesalePrice: d.precio_mayorista,
    imageUrls: d.imagenes,
    imageUrl: d.imagen_url?.trim() || undefined,
    discountPercent: d.descuento_pct,
    promotionStart: crear ? d.promo_inicio || undefined : d.promo_inicio,
    promotionEnd: crear ? d.promo_fin || undefined : d.promo_fin,
    categoryId: d.id_categoria,
    seasonId: d.id_temporada,
    collectionId: d.id_coleccion,
    supplierId: d.id_proveedor,
    sizeIds: d.id_tallas,
    colorIds: d.id_colores,
    ...(!crear ? { active: d.activo } : {}),
  };
}

function filtrosParaApi(f: FiltrosProducto) {
  return {
    search: f.q,
    categoryId: f.id_categoria,
    sizeId: f.id_talla,
    colorId: f.id_color,
    seasonId: f.id_temporada,
    collectionId: f.id_coleccion,
    supplierId: f.id_proveedor,
    minPrice: f.mayorista ? undefined : f.precio_min,
    maxPrice: f.mayorista ? undefined : f.precio_max,
  };
}

async function listarProductos(f: FiltrosProducto = {}) {
  const filtros = filtrosParaApi(f);
  const pagina = (page: number, limit: number, active = true) =>
    api.get<PaginaBackend<ProductoBackend>>(endpoints.catalogo.productos, {
      ...filtros,
      page,
      limit,
      active,
    });
  if (
    !f.mayorista &&
    !f.solo_promocion &&
    !f.orden &&
    !f.id_sucursal &&
    !f.solo_disponibles &&
    !f.incluir_inactivos
  ) {
    return adaptarPagina(await pagina(f.page ?? 1, f.page_size ?? 20), adaptarProducto);
  }
  // La API no soporta orden/promocion/sucursal en /products: no filtrar solo una pagina.
  const grupos = await Promise.all([
    todasLasPaginas((page, limit) => pagina(page, limit)),
    f.incluir_inactivos ? todasLasPaginas((page, limit) => pagina(page, limit, false)) : [],
  ]);
  let productos = [...new Map(grupos.flat().map((p) => [p.id, p])).values()].map(adaptarProducto);
  const precio = (p: (typeof productos)[number]) =>
    f.mayorista && p.precio_mayorista != null ? p.precio_mayorista : p.precio_actual!;
  const promocion = (p: (typeof productos)[number]) =>
    p.promocion_activa && !(f.mayorista && p.precio_mayorista != null);
  if (f.solo_promocion) productos = productos.filter(promocion);
  if (f.mayorista)
    productos = productos.filter(
      (p) =>
        (f.precio_min == null || precio(p) >= f.precio_min) &&
        (f.precio_max == null || precio(p) <= f.precio_max),
    );
  if (f.id_sucursal || f.solo_disponibles) {
    const stock = await disponibilidadService.listar({
      id_sucursal: f.id_sucursal,
      id_talla: f.id_talla,
      id_color: f.id_color,
    });
    const ids = new Set(stock.filter((i) => i.cantidad_disponible > 0).map((i) => i.id_producto));
    productos = productos.filter((p) => ids.has(p.id_producto));
  }
  productos.sort((a, b) => {
    let orden = 0;
    if (f.orden === 'nombre') orden = a.nombre.localeCompare(b.nombre, 'es');
    if (f.orden === 'precio_asc') orden = precio(a) - precio(b);
    if (f.orden === 'precio_desc') orden = precio(b) - precio(a);
    if (f.orden === 'descuento')
      orden = (promocion(b) ? b.descuento_pct : 0) - (promocion(a) ? a.descuento_pct : 0);
    return orden || b.id_producto - a.id_producto;
  });
  return paginarEnMemoria(productos, f);
}

function recurso<B, T>(
  url: string,
  adaptar: (d: B) => T,
  dto: (d: Partial<T>, crear: boolean) => object,
) {
  return {
    listar: async () => (await api.get<B[]>(url)).map(adaptar),
    crear: async (datos: Partial<T>) => adaptar(await api.post<B>(url, dto(datos, true))),
    actualizar: async (id: number, datos: Partial<T>) =>
      adaptar(await api.patch<B>(`${url}/${id}`, dto(datos, false))),
    eliminar: (id: number) => api.delete<unknown>(`${url}/${id}`),
  };
}
const categorias = recurso<CategoriaBackend, Categoria>(
  endpoints.catalogo.categorias,
  adaptarCategoria,
  (d) => ({ name: d.nombre?.trim(), description: d.descripcion }),
);
const tallas = recurso<NombreBackend, Talla>(endpoints.catalogo.tallas, adaptarTalla, (d) => ({
  name: d.nombre?.trim(),
}));
const colores = recurso<ColorBackend, Color>(endpoints.catalogo.colores, adaptarColor, (d) => ({
  name: d.nombre?.trim(),
  hexCode: d.codigo_hex,
}));
const temporadas = recurso<TemporadaBackend, Temporada>(
  endpoints.catalogo.temporadas,
  adaptarTemporada,
  (d, crear) => ({
    name: d.nombre?.trim(),
    startDate: d.fecha_inicio,
    endDate: d.fecha_fin,
    ...(!crear ? { active: d.activa } : {}),
  }),
);
const colecciones = recurso<ColeccionBackend, Coleccion>(
  endpoints.catalogo.colecciones,
  adaptarColeccion,
  (d, crear) => ({
    name: d.nombre?.trim(),
    description: d.descripcion,
    seasonId: d.id_temporada,
    ...(!crear ? { active: d.activa } : {}),
  }),
);

const real = {
  listarProductos,
  obtenerProducto: async (id: number) =>
    adaptarProducto(await api.get<ProductoBackend>(endpoints.catalogo.producto(id))),
  crearProducto: async (d: DatosProducto) => {
    if (!d.activo) throw new ErrorApi('Crea el producto activo; despues puedes desactivarlo.', 400);
    return adaptarProducto(
      await api.post<ProductoBackend>(endpoints.catalogo.productos, productoParaApi(d, true)),
    );
  },
  actualizarProducto: async (id: number, d: Partial<DatosProducto>) =>
    adaptarProducto(
      await api.patch<ProductoBackend>(endpoints.catalogo.producto(id), productoParaApi(d)),
    ),
  desactivarProducto: (id: number) => api.delete<unknown>(endpoints.catalogo.producto(id)),
  recursosRA: async (id: number) => (await real.obtenerProducto(id)).recursos_ra ?? [],
  listarCategorias: categorias.listar,
  crearCategoria: categorias.crear,
  actualizarCategoria: categorias.actualizar,
  eliminarCategoria: categorias.eliminar,
  listarTallas: tallas.listar,
  crearTalla: tallas.crear,
  actualizarTalla: tallas.actualizar,
  eliminarTalla: tallas.eliminar,
  listarColores: colores.listar,
  crearColor: colores.crear,
  actualizarColor: colores.actualizar,
  eliminarColor: colores.eliminar,
  listarTemporadas: temporadas.listar,
  crearTemporada: temporadas.crear,
  actualizarTemporada: temporadas.actualizar,
  eliminarTemporada: temporadas.eliminar,
  listarColecciones: colecciones.listar,
  crearColeccion: colecciones.crear,
  actualizarColeccion: colecciones.actualizar,
  eliminarColeccion: colecciones.eliminar,
};
export const catalogoService = USAR_MOCKS ? catalogoMock : real;
