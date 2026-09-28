import type { RecomendacionIA } from '../types/domain';
import type { MensajeChat, RespuestaAsistente } from '../types/ia';
import { adaptarProducto, type ProductoBackend } from './catalogo.contratos';

export interface RespuestaAsistenteBackend {
  reply: string;
  source: string;
  model: string | null;
  products: ProductoBackend[];
}

export interface RecomendacionBackend {
  id: number | null;
  clientId: number | null;
  productId: number;
  reason: string;
  score: number;
  source: string;
  createdAt: string;
  product: ProductoBackend;
}

/** Historial que acepta /ai/assistant: solo turnos reales, sin avisos de error. */
export function historialAsistente(mensajes: MensajeChat[]) {
  return mensajes
    .filter((m) => m.id !== 'bienvenida' && !m.id.startsWith('e-'))
    .slice(-6)
    .map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', text: m.texto.slice(0, 1200) }));
}

export function adaptarRespuestaAsistente(v: RespuestaAsistenteBackend): RespuestaAsistente {
  return {
    respuesta: v.reply,
    productos_sugeridos: v.products.map(adaptarProducto),
    origen: v.source,
  };
}

export function adaptarRecomendacion(v: RecomendacionBackend): RecomendacionIA {
  return {
    // Los visitantes no guardan historial: se usa una clave estable por producto.
    id_recomendacion: v.id ?? -v.productId,
    id_cliente: v.clientId ?? 0,
    id_producto: v.productId,
    fecha: v.createdAt,
    motivo: v.reason,
    puntuacion: v.score,
    origen: v.source,
    producto: adaptarProducto(v.product),
  };
}

export const esRespuestaIA = (origen?: string) => Boolean(origen?.startsWith('gemini') || origen?.startsWith('ollama'));
