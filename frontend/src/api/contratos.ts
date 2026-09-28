import { ErrorApi, type Paginado, type ParamsPaginacion } from '../types/api';

export interface RespuestaBackend<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface PaginaBackend<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Se desenvuelve una sola vez: una pagina tambien contiene su propio campo data. */
export function desenvolverRespuesta<T>(respuesta: RespuestaBackend<T>): T {
  if (!respuesta || respuesta.success !== true || !Object.hasOwn(respuesta, 'data')) {
    throw new ErrorApi('El servidor devolvio una respuesta incompatible.', 502);
  }
  return respuesta.data;
}

export function adaptarPagina<T, U>(
  pagina: PaginaBackend<T>,
  adaptar: (item: T) => U,
): Paginado<U> {
  return {
    items: pagina.data.map(adaptar),
    total: pagina.meta.total,
    page: pagina.meta.page,
    page_size: pagina.meta.limit,
  };
}

export function parametrosPagina({ page, page_size }: ParamsPaginacion) {
  return { page, limit: page_size };
}

/** Solo para selects completos y filtros que la API aun no ejecuta. */
export async function todasLasPaginas<T>(
  cargar: (page: number, limit: number) => Promise<PaginaBackend<T>>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const resultado = await cargar(page, 100);
    if (resultado.meta.page !== page)
      throw new ErrorApi('La paginacion del servidor es incompatible.', 502);
    items.push(...resultado.data);
    if (page >= resultado.meta.totalPages) return items;
  }
}

export function paginarEnMemoria<T>(
  items: T[],
  { page = 1, page_size = 20 }: ParamsPaginacion,
): Paginado<T> {
  return {
    items: items.slice((page - 1) * page_size, page * page_size),
    total: items.length,
    page,
    page_size,
  };
}
