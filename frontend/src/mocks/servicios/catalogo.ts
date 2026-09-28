/**
 * Catalogo: productos y sus entidades de apoyo.
 * Endpoints esperados:
 *   GET    /productos?q&id_categoria&...   -> Paginado<Producto>
 *   GET    /productos/:id                  -> Producto
 *   POST   /productos                      -> Producto
 *   PUT    /productos/:id                  -> Producto
 *   DELETE /productos/:id                  -> baja logica
 *   GET    /categorias | /tallas | /colores | /temporadas | /colecciones
 *   GET    /productos/:id/recursos-ra      -> RecursoRA[]
 */
import { api } from '../../api/http';
import { endpoints } from '../endpoints';
import type { Paginado, ParamsPaginacion } from '../../types/api';
import type {
  Categoria,
  Coleccion,
  Color,
  Producto,
  RecursoRA,
  Talla,
  Temporada,
} from '../../types/domain';

export interface FiltrosProducto extends ParamsPaginacion {
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

export const catalogoService = {
  listarProductos(filtros: FiltrosProducto = {}) {
    return api.get<Paginado<Producto>>(endpoints.catalogo.productos, filtros);
  },
  obtenerProducto(id: number) {
    return api.get<Producto>(endpoints.catalogo.producto(id));
  },
  crearProducto(datos: DatosProducto) {
    return api.post<Producto>(endpoints.catalogo.productos, datos);
  },
  actualizarProducto(id: number, datos: Partial<DatosProducto>) {
    return api.put<Producto>(endpoints.catalogo.producto(id), datos);
  },
  desactivarProducto(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.catalogo.producto(id));
  },
  recursosRA(idProducto: number) {
    return api.get<RecursoRA[]>(endpoints.catalogo.recursosRA(idProducto));
  },

  listarCategorias() {
    return api.get<Categoria[]>(endpoints.catalogo.categorias);
  },
  crearCategoria(datos: Omit<Categoria, 'id_categoria'>) {
    return api.post<Categoria>(endpoints.catalogo.categorias, datos);
  },
  actualizarCategoria(id: number, datos: Partial<Categoria>) {
    return api.put<Categoria>(endpoints.catalogo.categoria(id), datos);
  },
  eliminarCategoria(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.catalogo.categoria(id));
  },

  listarTallas() {
    return api.get<Talla[]>(endpoints.catalogo.tallas);
  },
  crearTalla(datos: Omit<Talla, 'id_talla'>) {
    return api.post<Talla>(endpoints.catalogo.tallas, datos);
  },
  actualizarTalla(id: number, datos: Partial<Talla>) {
    return api.put<Talla>(endpoints.catalogo.talla(id), datos);
  },
  eliminarTalla(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.catalogo.talla(id));
  },

  listarColores() {
    return api.get<Color[]>(endpoints.catalogo.colores);
  },
  crearColor(datos: Omit<Color, 'id_color'>) {
    return api.post<Color>(endpoints.catalogo.colores, datos);
  },
  actualizarColor(id: number, datos: Partial<Color>) {
    return api.put<Color>(endpoints.catalogo.color(id), datos);
  },
  eliminarColor(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.catalogo.color(id));
  },

  listarTemporadas() {
    return api.get<Temporada[]>(endpoints.catalogo.temporadas);
  },
  crearTemporada(datos: Omit<Temporada, 'id_temporada'>) {
    return api.post<Temporada>(endpoints.catalogo.temporadas, datos);
  },
  actualizarTemporada(id: number, datos: Partial<Temporada>) {
    return api.put<Temporada>(endpoints.catalogo.temporada(id), datos);
  },
  eliminarTemporada(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.catalogo.temporada(id));
  },

  listarColecciones() {
    return api.get<Coleccion[]>(endpoints.catalogo.colecciones);
  },
  crearColeccion(datos: Omit<Coleccion, 'id_coleccion'>) {
    return api.post<Coleccion>(endpoints.catalogo.colecciones, datos);
  },
  actualizarColeccion(id: number, datos: Partial<Coleccion>) {
    return api.put<Coleccion>(endpoints.catalogo.coleccion(id), datos);
  },
  eliminarColeccion(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.catalogo.coleccion(id));
  },
};
