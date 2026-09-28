/** Recomendaciones y asistente. El proveedor real (Gemini o IA local) vive en NestJS. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { iaService, type OpcionesRecomendacion } from '../services/ia.service';
import { useSesion } from '../context/SesionContext';
import type { MensajeChat } from '../types/ia';

/** Publicas: con sesion de cliente el backend las personaliza con su historial. */
export function useRecomendaciones(opciones: OpcionesRecomendacion = {}, habilitado = true) {
  const { usuario, restaurando } = useSesion();
  return useQuery({
    queryKey: ['recomendaciones', opciones, usuario?.id_usuario ?? 0],
    queryFn: () => iaService.recomendaciones(opciones),
    enabled: habilitado && !restaurando,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function usePreguntarIA() {
  return useMutation({
    mutationFn: ({ mensaje, historial }: { mensaje: string; historial: MensajeChat[] }) =>
      iaService.preguntar(mensaje, historial),
  });
}
