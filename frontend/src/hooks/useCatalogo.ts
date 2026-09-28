import { invalidarCatalogo } from './invalidarCatalogo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  catalogoService,
  type DatosProducto,
  type FiltrosProducto,
} from '../services/catalogo.service';
import { claves } from './claves';

const CACHE_LARGO = 10 * 60 * 1000; // catalogos de apoyo cambian poco

export function useProductos(filtros: FiltrosProducto = {}, habilitado = true) {
  return useQuery({
    queryKey: claves.productos(filtros),
    enabled: habilitado,
    queryFn: () => catalogoService.listarProductos(filtros),
    staleTime: 60 * 1000,
  });
}

export function useProducto(id: number | undefined) {
  return useQuery({
    queryKey: claves.producto(id ?? 0),
    queryFn: () => catalogoService.obtenerProducto(id!),
    enabled: Boolean(id),
  });
}

export function useRecursosRA(id: number | undefined) {
  return useQuery({
    queryKey: claves.recursosRA(id ?? 0),
    queryFn: () => catalogoService.recursosRA(id!),
    enabled: Boolean(id),
    staleTime: CACHE_LARGO,
  });
}

export function useCategorias() {
  return useQuery({
    queryKey: claves.categorias,
    queryFn: catalogoService.listarCategorias,
    staleTime: CACHE_LARGO,
  });
}

export function useTallas() {
  return useQuery({
    queryKey: claves.tallas,
    queryFn: catalogoService.listarTallas,
    staleTime: CACHE_LARGO,
  });
}

export function useColores() {
  return useQuery({
    queryKey: claves.colores,
    queryFn: catalogoService.listarColores,
    staleTime: CACHE_LARGO,
  });
}

export function useTemporadas() {
  return useQuery({
    queryKey: claves.temporadas,
    queryFn: catalogoService.listarTemporadas,
    staleTime: CACHE_LARGO,
  });
}

export function useColecciones() {
  return useQuery({
    queryKey: claves.colecciones,
    queryFn: catalogoService.listarColecciones,
    staleTime: CACHE_LARGO,
  });
}

export function useGuardarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      entrada:
        { id: number; datos: Partial<DatosProducto> } | { id?: undefined; datos: DatosProducto },
    ) =>
      entrada.id !== undefined
        ? catalogoService.actualizarProducto(entrada.id, entrada.datos)
        : catalogoService.crearProducto(entrada.datos),
    onSuccess: () => invalidarCatalogo(qc),
  });
}

export function useDesactivarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => catalogoService.desactivarProducto(id),
    onSuccess: () => invalidarCatalogo(qc),
  });
}
