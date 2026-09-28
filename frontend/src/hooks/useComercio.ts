import { ErrorApi } from '../types/api';
import { revisionSesion } from '../api/sesion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  carritoService,
  reservasService,
  ventasService,
  type DatosReserva,
  type DatosVenta,
  type FiltrosReserva,
  type FiltrosVenta,
  type LineaSeleccion,
} from '../services/comercio.service';
import { totalLineas } from '../lib/domain';
import type { Carrito, Reserva, EstadoReserva } from '../types/domain';
import { claves } from './claves';

/* ---------------- carrito ---------------- */

export function useCarrito() {
  const { esCliente, autenticado } = useAuth();
  const consulta = useQuery({
    queryKey: claves.carrito,
    queryFn: carritoService.obtener,
    enabled: autenticado && esCliente,
    staleTime: 30 * 1000,
  });

  const detalles = consulta.data?.detalles ?? [];
  return {
    ...consulta,
    detalles,
    unidades: consulta.data?.cantidad_total ?? detalles.reduce((acc, d) => acc + d.cantidad, 0),
    total: consulta.data?.total ?? totalLineas(detalles),
  };
}

function useMutacionCarrito<T>(operacion: (datos: T) => Promise<Carrito>) {
  const qc = useQueryClient();
  const mutacion = useMutation({
    mutationKey: ['carrito', 'cambio'],
    scope: { id: 'carrito' },
    mutationFn: ({ datos, revision }: { datos: T; revision: number }) => {
      if (revision !== revisionSesion())
        throw new ErrorApi('La sesion cambio. Vuelve a intentarlo.', 409);
      return operacion(datos);
    },
    onMutate: () => qc.cancelQueries({ queryKey: claves.carrito }),
    onSuccess: (carrito, { revision }) => {
      if (revision === revisionSesion()) qc.setQueryData(claves.carrito, carrito);
    },
    onSettled: (_data, _error, { revision }) => {
      if (revision === revisionSesion()) return qc.invalidateQueries({ queryKey: claves.carrito });
    },
  });
  return {
    ...mutacion,
    mutateAsync: (datos: T) => mutacion.mutateAsync({ datos, revision: revisionSesion() }),
    mutate: (datos: T) => mutacion.mutate({ datos, revision: revisionSesion() }),
  };
}
export function useAgregarAlCarrito() {
  return useMutacionCarrito((linea: LineaSeleccion) => carritoService.agregar(linea));
}
export function useCambiarCantidadCarrito() {
  return useMutacionCarrito(({ id, cantidad }: { id: number; cantidad: number }) =>
    carritoService.cambiarCantidad(id, cantidad),
  );
}
export function useQuitarDelCarrito() {
  return useMutacionCarrito((id: number) => carritoService.quitar(id));
}
export function useVaciarCarrito() {
  return useMutacionCarrito<void>(() => carritoService.vaciar());
}

/* ---------------- reservas ---------------- */

export function useReservas(filtros: FiltrosReserva = {}, habilitado = true) {
  return useQuery({
    queryKey: claves.reservas(filtros),
    queryFn: () => reservasService.listar(filtros),
    enabled: habilitado,
    refetchInterval: 30000,
  });
}

export function useMisReservas(filtros: FiltrosReserva = {}) {
  return useQuery({
    queryKey: ['reservas', 'propias', filtros],
    queryFn: () => reservasService.propias(filtros),
    refetchInterval: 30000,
  });
}

export function useReserva(id: number | undefined) {
  return useQuery({
    queryKey: claves.reserva(id ?? 0),
    queryFn: () => reservasService.obtener(id!),
    enabled: Boolean(id),
    refetchInterval: 30000,
  });
}

function useMutacionReserva<T>(operacion: (datos: T) => Promise<Reserva>) {
  const qc = useQueryClient();
  const cambio = useMutation({
    mutationKey: ['reservas', 'cambio'],
    mutationFn: async ({ datos, revision }: { datos: T; revision: number }) => {
      if (revision !== revisionSesion())
        throw new ErrorApi('La sesion cambio. Vuelve a intentarlo.', 409);
      const reserva = await operacion(datos);
      if (revision !== revisionSesion())
        throw new ErrorApi('La sesion cambio durante la operacion.', 409);
      return reserva;
    },
    onSettled: (_data, _error, { revision }) => {
      // Un 409 tambien puede haber confirmado vencimiento y liberado stock en NestJS.
      if (revision !== revisionSesion()) return;
      return Promise.all(
        [
          'reservas',
          'reserva',
          'inventario',
          'movimientos',
          'disponibilidad',
          'productos',
          'carrito',
          'notificaciones',
          'reportes',
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
  return {
    ...cambio,
    mutateAsync: (datos: T) => cambio.mutateAsync({ datos, revision: revisionSesion() }),
  };
}
export function useCrearReserva() {
  return useMutacionReserva((datos: DatosReserva) => reservasService.crear(datos));
}
export function useCambiarEstadoReserva() {
  return useMutacionReserva(({ id, estado }: { id: number; estado: EstadoReserva }) =>
    reservasService.cambiarEstado(id, estado),
  );
}
export function useCancelarReserva() {
  return useMutacionReserva((id: number) => reservasService.cancelar(id));
}

/* ---------------- ventas ---------------- */

export function useVentas(filtros: FiltrosVenta = {}, habilitado = true) {
  return useQuery({
    queryKey: claves.ventas(filtros),
    queryFn: () => ventasService.listar(filtros),
    enabled: habilitado,
  });
}

export function useMisCompras(filtros: FiltrosVenta = {}) {
  return useQuery({ queryKey: ['ventas', 'propias', filtros], queryFn: () => ventasService.propias(filtros) });
}

export function useVenta(id: number | undefined) {
  return useQuery({
    queryKey: claves.venta(id ?? 0),
    queryFn: () => ventasService.obtener(id!),
    enabled: Boolean(id),
  });
}

export function useRegistrarVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosVenta) => ventasService.registrar(datos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      qc.invalidateQueries({ queryKey: claves.carrito });
    },
  });
}
