/**
 * IA. Gemini (o el modelo local) se invoca en NestJS: la app nunca maneja claves.
 *   POST /ai/assistant        -> { reply, source, products }
 *   GET  /ai/recommendations  -> recomendaciones con motivo (personalizadas con sesion de cliente)
 */
import { api, USAR_MOCKS } from '../api/http';
import { endpoints } from '../api/endpoints';
import {
  adaptarRecomendacion,
  adaptarRespuestaAsistente,
  historialAsistente,
  type RecomendacionBackend,
  type RespuestaAsistenteBackend,
} from '../api/ia.contratos';
import { rutasMock } from '../mocks/endpoints';
import type { RecomendacionIA } from '../types/domain';
import type { MensajeChat, RespuestaAsistente } from '../types/ia';

export interface OpcionesRecomendacion {
  limite?: number;
  contexto?: string;
  id_producto?: number;
}

export const iaService = {
  async preguntar(mensaje: string, historial: MensajeChat[] = []): Promise<RespuestaAsistente> {
    if (USAR_MOCKS)
      return api.post<RespuestaAsistente>(rutasMock.ia.asistente, {
        mensaje,
        historial: historial.map((m) => m.texto),
      });
    return adaptarRespuestaAsistente(
      await api.post<RespuestaAsistenteBackend>(endpoints.ia.asistente, {
        message: mensaje,
        history: historialAsistente(historial),
      }),
    );
  },
  async recomendaciones(opciones: OpcionesRecomendacion = {}): Promise<RecomendacionIA[]> {
    if (USAR_MOCKS) return api.get<RecomendacionIA[]>(rutasMock.ia.recomendaciones, opciones);
    const lista = await api.get<RecomendacionBackend[]>(endpoints.ia.recomendaciones, {
      limit: opciones.limite,
      context: opciones.contexto || undefined,
      productId: opciones.id_producto,
    });
    return lista.map(adaptarRecomendacion);
  },
};
