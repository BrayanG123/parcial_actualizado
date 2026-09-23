/**
 * Probador con IA. NestJS combina la foto de la persona con la foto de la
 * prenda (Gemini, edicion de imagenes); la app nunca maneja claves.
 *   GET  /virtual-fitting/status  -> { available, model }
 *   POST /virtual-fitting/try-on  -> { image (base64), mimeType, model, ... }
 *
 * La RA en vivo no pasa por aqui: corre completa en el telefono.
 */
import { api, USAR_MOCKS } from '../api/http';
import { endpoints } from '../api/endpoints';
import { ErrorApi } from '../types/api';

interface EstadoBackend {
  available: boolean;
  model: string | null;
}

interface PruebaBackend {
  productId: number;
  productName: string;
  image: string;
  mimeType: string;
  model: string;
}

export interface PruebaIA {
  /** data URI lista para <Image source={{ uri }} />. */
  uri: string;
  modelo: string;
}

/** Generar una imagen tarda bastante mas que una respuesta de texto. */
const TIEMPO_IA_MS = 120000;

export const probadorService = {
  async disponible(): Promise<boolean> {
    if (USAR_MOCKS) return false;
    return (await api.get<EstadoBackend>(endpoints.probador.estado)).available;
  },
  /** `foto` es un data URI JPEG (la captura del probador en vivo). */
  async probarConIA(idProducto: number, foto: string): Promise<PruebaIA> {
    if (USAR_MOCKS) throw new ErrorApi('El probador con IA necesita el servidor real.', 0);
    const r = await api.post<PruebaBackend>(
      endpoints.probador.probarConIA,
      { productId: idProducto, image: foto, mimeType: 'image/jpeg' },
      { timeout: TIEMPO_IA_MS },
    );
    return { uri: `data:${r.mimeType};base64,${r.image}`, modelo: r.model };
  },
};
