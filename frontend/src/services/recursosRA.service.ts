/**
 * Modelos 3D del probador virtual (RecursoRA). La RA se ejecuta en la app movil;
 * aqui el administrador solo registra la URL publica del archivo GLB/GLTF/USDZ.
 *   GET    /products/:id/ar-resources
 *   POST   /products/:id/ar-resources
 *   DELETE /products/:id/ar-resources/:resourceId
 */
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarRecurso, type RecursoBackend } from '../api/catalogo.contratos';
import { ErrorApi } from '../types/api';
import type { RecursoRA } from '../types/domain';

export const FORMATOS_RA = ['GLB', 'GLTF', 'USDZ'] as const;
export type FormatoRA = (typeof FORMATOS_RA)[number];

export function validarRecursoRA(url: string, formato: string) {
  let destino: URL;
  try {
    destino = new URL(url.trim());
  } catch {
    throw new ErrorApi('Ingresa la URL completa del modelo 3D (https://...).', 400);
  }
  if (!['https:', 'http:'].includes(destino.protocol))
    throw new ErrorApi('La URL del modelo debe empezar con https://.', 400);
  if (!FORMATOS_RA.includes(formato as FormatoRA))
    throw new ErrorApi('Elige un formato GLB, GLTF o USDZ.', 400);
}

export const recursosRAService = {
  async listar(idProducto: number): Promise<RecursoRA[]> {
    return (await api.get<RecursoBackend[]>(endpoints.catalogo.recursosRA(idProducto))).map(adaptarRecurso);
  },
  async crear(idProducto: number, url: string, formato: FormatoRA): Promise<RecursoRA> {
    validarRecursoRA(url, formato);
    return adaptarRecurso(
      await api.post<RecursoBackend>(endpoints.catalogo.recursosRA(idProducto), {
        url: url.trim(),
        format: formato,
      }),
    );
  },
  desactivar(idProducto: number, id: number) {
    return api.delete<RecursoBackend>(endpoints.catalogo.recursoRA(idProducto, id));
  },
};
