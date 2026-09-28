import type { Producto } from './domain';

export interface MensajeChat {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  productos?: Producto[];
  /** gemini, ollama o rules cuando el proveedor de IA no respondio. */
  origen?: string;
  fecha: string;
}

/** POST /ai/assistant adaptado. */
export interface RespuestaAsistente {
  respuesta: string;
  productos_sugeridos: Producto[];
  origen?: string;
}
