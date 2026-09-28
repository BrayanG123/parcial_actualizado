/** Carrito, reservas y compras del cliente. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  carritoService,
  reservasService,
  ventasService,
  type DatosReserva,
  type FiltrosReserva,
  type FiltrosVenta,
  type LineaSeleccion,
} from '../services/comercio.service';
import { checkoutService, type PedidoCheckout } from '../services/checkout.service';
import type { Carrito } from '../types/domain';
import { useSesion } from '../context/SesionContext';
import { claves } from './claves';

/* ---------------- carrito ---------------- */

export function useCarrito() {
  const { autenticado } = useSesion();
  return useQuery({
    queryKey: claves.carrito,
    queryFn: carritoService.obtener,
    enabled: autenticado,
    staleTime: 10 * 1000,
  });
}

/**
 * Todas las mutaciones del carrito devuelven el carrito completo, asi que se
 * escribe directo en la cache: no hace falta un refetch adicional.
 */
function useMutacionCarrito<TVars>(fn: (vars: TVars) => Promise<Carrito>) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (carrito) => cliente.setQueryData(claves.carrito, carrito),
  });
}

export function useAgregarAlCarrito() {
  return useMutacionCarrito((linea: LineaSeleccion) => carritoService.agregar(linea));
}

export function useCambiarCantidad() {
  return useMutacionCarrito(({ id, cantidad }: { id: number; cantidad: number }) =>
    carritoService.cambiarCantidad(id, cantidad),
  );
}

export function useQuitarDelCarrito() {
  return useMutacionCarrito((id: number) => carritoService.quitar(id));
}

export function useVaciarCarrito() {
  return useMutacionCarrito(() => carritoService.vaciar());
}

/* ---------------- reservas ---------------- */

export function useReservas(filtros: FiltrosReserva = {}) {
  const { autenticado } = useSesion();
  return useQuery({
    queryKey: claves.reservas(filtros),
    queryFn: () => reservasService.listar(filtros),
    enabled: autenticado,
  });
}

export function useCrearReserva() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosReserva) => reservasService.crear(datos),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['reservas'] });
      void cliente.invalidateQueries({ queryKey: ['disponibilidad'] });
    },
  });
}

export function useCancelarReserva() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reservasService.cancelar(id),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['reservas'] });
      void cliente.invalidateQueries({ queryKey: ['disponibilidad'] });
    },
  });
}

/* ---------------- compras ---------------- */

export function useCompras(filtros: FiltrosVenta = {}) {
  const { autenticado } = useSesion();
  return useQuery({
    queryKey: claves.ventas(filtros),
    queryFn: () => ventasService.listar(filtros),
    enabled: autenticado,
  });
}

/** Confirma el checkout: el backend convierte el carrito y aparta el stock. */
export function useConfirmarCheckout() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (pedido: PedidoCheckout) => checkoutService.confirmar(pedido),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: claves.carrito });
      void cliente.invalidateQueries({ queryKey: ['ventas'] });
      void cliente.invalidateQueries({ queryKey: ['disponibilidad'] });
    },
  });
}
