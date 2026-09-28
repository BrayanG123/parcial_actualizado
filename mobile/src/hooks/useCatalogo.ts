/**
 * Datos del catalogo. Ninguna pantalla llama al servicio directamente:
 * pasa por estos hooks para compartir cache y estados de carga.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { catalogoService, type FiltrosProducto } from '../services/catalogo.service';
import { claves } from './claves';

/** Las entidades de apoyo casi no cambian: se cachean por toda la sesion. */
const CACHE_LARGO = { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 };

const POR_PAGINA = 10;

/** Catalogo con scroll infinito: se piden 10 productos por pagina. */
export function useProductos(filtros: FiltrosProducto = {}) {
  return useInfiniteQuery({
    queryKey: claves.productos(filtros),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      catalogoService.listarProductos({ ...filtros, page: pageParam, page_size: POR_PAGINA }),
    getNextPageParam: (ultima) => {
      const cargados = ultima.page * ultima.page_size;
      return cargados < ultima.total ? ultima.page + 1 : undefined;
    },
    staleTime: 60 * 1000,
  });
}

export function useProducto(id: number) {
  return useQuery({
    queryKey: claves.producto(id),
    queryFn: () => catalogoService.obtenerProducto(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useRecursosRA(idProducto: number, habilitado = true) {
  return useQuery({
    queryKey: claves.recursosRA(idProducto),
    queryFn: () => catalogoService.recursosRA(idProducto),
    enabled: habilitado && idProducto > 0,
    ...CACHE_LARGO,
  });
}

/**
 * Disponibilidad completa del producto (todas las combinaciones
 * talla + color + sucursal). Se pide una sola vez y la pantalla de detalle
 * filtra en memoria, en lugar de consultar en cada toque del selector.
 */
export function useDisponibilidad(idProducto: number) {
  return useQuery({
    queryKey: claves.disponibilidad(idProducto),
    queryFn: () => catalogoService.disponibilidad({ id_producto: idProducto }),
    enabled: idProducto > 0,
    staleTime: 30 * 1000,
  });
}

export function useCategorias() {
  return useQuery({ queryKey: claves.categorias, queryFn: catalogoService.listarCategorias, ...CACHE_LARGO });
}

export function useTallas() {
  return useQuery({ queryKey: claves.tallas, queryFn: catalogoService.listarTallas, ...CACHE_LARGO });
}

export function useColores() {
  return useQuery({ queryKey: claves.colores, queryFn: catalogoService.listarColores, ...CACHE_LARGO });
}

export function useSucursales() {
  return useQuery({ queryKey: claves.sucursales, queryFn: catalogoService.listarSucursales, ...CACHE_LARGO });
}
