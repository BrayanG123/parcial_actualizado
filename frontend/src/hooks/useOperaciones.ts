import { USAR_MOCKS } from '../api/config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventarioService,
  type ConsultaDisponibilidad,
  type DatosMovimiento,
  type FiltrosInventario,
  type FiltrosMovimiento,
  type DatosEntrada,
} from '../services/inventario.service';
import {
  proveedoresService,
  rolesService,
  sucursalesService,
  usuariosService,
  type DatosUsuario,
  type FiltrosUsuario,
} from '../services/organizacion.service';
import { reportesService } from '../services/reportes.service';
import { iaService, type OpcionesRecomendacion } from '../services/ia.service';
import type { MensajeChat } from '../types/ia';
import type { FiltroInventarioReporte, FiltroReporte } from '../types/reportes';
import { claves } from './claves';

const CACHE_LARGO = 10 * 60 * 1000;

/* ---------------- inventario ---------------- */

export function useInventario(filtros: FiltrosInventario = {}) {
  return useQuery({
    queryKey: claves.inventario(filtros),
    queryFn: () => inventarioService.listar(filtros),
  });
}

export function useDisponibilidad(consulta: ConsultaDisponibilidad | null) {
  return useQuery({
    queryKey: claves.disponibilidad(consulta),
    queryFn: () => inventarioService.disponibilidad(consulta!),
    enabled: Boolean(consulta?.id_producto),
  });
}

export function useMovimientos(filtros: FiltrosMovimiento) {
  return useQuery({
    queryKey: claves.movimientos(filtros),
    queryFn: () => inventarioService.movimientos(filtros),
    enabled: USAR_MOCKS || Boolean(filtros.id_inventario),
  });
}

export function useRegistrarMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosMovimiento) => inventarioService.registrarMovimiento(datos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: ['disponibilidad'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['carrito'] });
    },
  });
}

export function useRegistroInventario(id: number) {
  return useQuery({
    queryKey: ['inventario', 'detalle', id],
    queryFn: () => inventarioService.obtener(id),
    enabled: id > 0,
  });
}
export function useEntradaInventario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosEntrada) => inventarioService.registrarEntrada(datos),
    onSuccess: () => invalidarStock(qc),
  });
}
export function useCompletarEntrada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => inventarioService.completarEntrada(id),
    onSuccess: () => invalidarStock(qc),
  });
}
function invalidarStock(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all(
    ['inventario', 'movimientos', 'disponibilidad', 'productos', 'carrito', 'reportes'].map((key) =>
      qc.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

/* ---------------- organizacion ---------------- */

export function useSucursales() {
  return useQuery({
    queryKey: claves.sucursales,
    queryFn: sucursalesService.listar,
    staleTime: CACHE_LARGO,
  });
}

export function useProveedores() {
  return useQuery({
    queryKey: claves.proveedores,
    queryFn: proveedoresService.listar,
    staleTime: CACHE_LARGO,
  });
}

export function useProductosDeProveedor(id: number | undefined) {
  return useQuery({
    queryKey: claves.productosProveedor(id ?? 0),
    queryFn: () => proveedoresService.productos(id!),
    enabled: Boolean(id),
  });
}

export function useUsuarios(filtros: FiltrosUsuario = {}) {
  return useQuery({
    queryKey: claves.usuarios(filtros),
    queryFn: () => usuariosService.listar(filtros),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: claves.roles,
    queryFn: rolesService.listar,
    staleTime: CACHE_LARGO,
  });
}

export function useGuardarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: number; datos: DatosUsuario }) =>
      id ? usuariosService.actualizar(id, datos) : usuariosService.crear(datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function useDesactivarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => usuariosService.desactivar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

/* ---------------- reportes ---------------- */

export function useReporteVentas(filtros: FiltroReporte = {}) {
  return useQuery({
    queryKey: claves.reportes('ventas', filtros),
    queryFn: () => reportesService.ventas(filtros),
  });
}

export function useTopProductos(filtros: FiltroReporte & { limite?: number } = {}) {
  return useQuery({
    queryKey: claves.reportes('top', filtros),
    queryFn: () => reportesService.topProductos(filtros),
  });
}

export function useReporteInventario(filtros: FiltroInventarioReporte = {}) {
  return useQuery({
    queryKey: claves.reportes('inventario', filtros),
    queryFn: () => reportesService.inventario(filtros),
    placeholderData: (anterior) => anterior,
  });
}

export function useReporteCaja(filtros: FiltroReporte & { id_caja?: number } = {}) {
  return useQuery({
    queryKey: claves.reportes('caja', filtros),
    queryFn: () => reportesService.caja(filtros),
  });
}

export function useReservasPorEstado(filtros: FiltroReporte = {}) {
  return useQuery({
    queryKey: claves.reportes('reservas-estado', filtros),
    queryFn: () => reportesService.reservasPorEstado(filtros),
  });
}

/* ---------------- IA ---------------- */

export function useRecomendaciones(opciones: OpcionesRecomendacion = {}, habilitado = true) {
  return useQuery({
    queryKey: claves.recomendaciones(opciones),
    queryFn: () => iaService.recomendaciones(opciones),
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function usePreguntarIA() {
  return useMutation({
    mutationFn: ({ mensaje, historial }: { mensaje: string; historial?: MensajeChat[] }) =>
      iaService.preguntar(mensaje, historial),
  });
}

export function useEstadoIA() {
  return useQuery({ queryKey: ['ia', 'estado'], queryFn: iaService.estado, staleTime: CACHE_LARGO });
}

export function useReporteIA() {
  return useMutation({ mutationFn: (pregunta: string) => iaService.reporte(pregunta) });
}
