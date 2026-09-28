/**
 * IA. Gemini o el modelo local se invocan en NestJS: el frontend nunca maneja claves.
 *   GET  /ai/status
 *   POST /ai/assistant
 *   GET  /ai/recommendations
 *   POST /ai/reports
 */
import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { endpoints as mocks } from '../mocks/endpoints';
import {
  adaptarRecomendacion,
  adaptarReporteIA,
  adaptarRespuestaAsistente,
  type EstadoIABackend,
  type RecomendacionBackend,
  type ReporteIABackend,
  type RespuestaAsistenteBackend,
} from '../api/ia.contratos';
import { ErrorApi } from '../types/api';
import type { RecomendacionIA } from '../types/domain';
import type { EstadoIA, MensajeChat, RespuestaAsistente } from '../types/ia';

export interface OpcionesRecomendacion {
  limite?: number;
  contexto?: string;
  id_producto?: number;
}

export const iaService = {
  async estado(): Promise<EstadoIA> {
    if (USAR_MOCKS) return { proveedor: 'none', modelo: null, configurado: false };
    const v = await api.get<EstadoIABackend>(endpoints.ia.estado);
    return { proveedor: v.provider, modelo: v.model, configurado: v.configured };
  },
  async preguntar(mensaje: string, historial: MensajeChat[] = []): Promise<RespuestaAsistente> {
    if (USAR_MOCKS) return api.post<RespuestaAsistente>(mocks.ia.asistente, { mensaje });
    return adaptarRespuestaAsistente(
      await api.post<RespuestaAsistenteBackend>(endpoints.ia.asistente, {
        message: mensaje,
        history: historial.slice(-10).map((m) => ({
          role: m.rol === 'usuario' ? 'user' : 'assistant',
          text: m.texto.slice(0, 1200),
        })),
      }),
    );
  },
  async recomendaciones(opciones: OpcionesRecomendacion = {}): Promise<RecomendacionIA[]> {
    if (USAR_MOCKS) return api.get<RecomendacionIA[]>(mocks.ia.recomendaciones, opciones);
    const lista = await api.get<RecomendacionBackend[]>(endpoints.ia.recomendaciones, {
      limit: opciones.limite,
      context: opciones.contexto || undefined,
      productId: opciones.id_producto,
    });
    return lista.map(adaptarRecomendacion);
  },
  async reporte(pregunta: string) {
    if (USAR_MOCKS)
      throw new ErrorApi('Los reportes con IA requieren la API real de NestJS.', 400);
    return adaptarReporteIA(
      await api.post<ReporteIABackend>(endpoints.ia.reportes, { question: pregunta }),
    );
  },
};
