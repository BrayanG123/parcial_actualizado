/**
 * Router del mock temporal.
 * Resuelve las mismas rutas que expondra NestJS para que la capa de servicios
 * no distinga entre mock y backend real.
 */
import { ErrorApi } from '../types/api';
import { usuarioDesdeToken, type MetodoHttp, type RutaMock } from './core';
import { rutasAuth } from './rutas/auth';
import { rutasCatalogo } from './rutas/catalogo';
import { rutasComercio } from './rutas/comercio';
import { rutasIA } from './rutas/ia';
import { rutasInventario } from './rutas/inventario';
import { guardarEstado } from './persistencia';

const rutas: RutaMock[] = [
  ...rutasAuth,
  ...rutasCatalogo,
  ...rutasInventario,
  ...rutasComercio,
  ...rutasIA,
];

export { restaurarEstado, reiniciarMock } from './persistencia';

/** Latencia simulada para que los estados de carga sean visibles. */
const LATENCIA_MS = 180;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockRequest<T>(
  metodo: MetodoHttp,
  url: string,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const ruta = url.split('?')[0];
  const encontrada = rutas.find((r) => r.metodo === metodo && r.patron.test(ruta));

  await esperar(LATENCIA_MS);

  if (!encontrada) {
    throw new ErrorApi(`No encontramos la informacion solicitada. (${metodo} ${ruta})`, 404);
  }

  const coincidencia = ruta.match(encontrada.patron)!;
  const resultado = encontrada.handler({
    partes: coincidencia.slice(1),
    params: params ?? {},
    body: body ?? null,
    usuario: usuarioDesdeToken(),
  }) as T;

  if (metodo !== 'GET') guardarEstado();
  return resultado;
}
