import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificacionesService } from '../services/notificaciones.service';
import type { FiltrosNotificaciones } from '../types/notificaciones';

/** Actualizacion periodica simple: suficiente para la demo, sin sockets. */
const INTERVALO_MS = 30 * 1000;

export function useContadorNotificaciones(habilitado: boolean) {
  return useQuery({
    queryKey: ['notificaciones', 'contador'],
    queryFn: notificacionesService.contador,
    enabled: habilitado,
    refetchInterval: habilitado ? INTERVALO_MS : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useNotificaciones(filtros: FiltrosNotificaciones, habilitado: boolean) {
  return useQuery({
    queryKey: ['notificaciones', 'lista', filtros],
    queryFn: () => notificacionesService.listar(filtros),
    enabled: habilitado,
    refetchInterval: habilitado ? INTERVALO_MS : false,
  });
}

export function useMarcarNotificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => notificacionesService.marcarLeida(id))),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  });
}
