import { siguienteId, secuencias } from '../db';
import { noEncontrado, texto, type RutaMock } from '../core';

interface OpcionesCrud<T> {
  /** Segmento de la ruta, por ejemplo "categorias". */
  ruta: string;
  coleccion: T[];
  campoId: keyof T & string;
  secuencia: keyof typeof secuencias;
  /** Campos usados por el buscador simple ?q= */
  camposBusqueda: Array<keyof T & string>;
  /** Valores por defecto al crear. */
  porDefecto?: Partial<T>;
}

/**
 * Genera las rutas CRUD estandar de un catalogo simple.
 * Replica lo que expondra un controlador NestJS basico.
 */
export function rutasCrud<T extends Record<string, any>>(op: OpcionesCrud<T>): RutaMock[] {
  const base = new RegExp(`^/${op.ruta}$`);
  const item = new RegExp(`^/${op.ruta}/(\\d+)$`);

  const buscar = (id: number) => op.coleccion.find((x) => x[op.campoId] === id);

  return [
    {
      metodo: 'GET',
      patron: base,
      handler: ({ params }) => {
        const q = texto(params.q);
        if (!q) return op.coleccion;
        return op.coleccion.filter((x) =>
          op.camposBusqueda.some((campo) => String(x[campo] ?? '').toLowerCase().includes(q)),
        );
      },
    },
    {
      metodo: 'GET',
      patron: item,
      handler: ({ partes }) => buscar(Number(partes[0])) ?? noEncontrado(op.ruta),
    },
    {
      metodo: 'POST',
      patron: base,
      handler: ({ body }) => {
        const nuevo = { ...op.porDefecto, ...body, [op.campoId]: siguienteId(op.secuencia) } as T;
        op.coleccion.push(nuevo);
        return nuevo;
      },
    },
    {
      metodo: 'PUT',
      patron: item,
      handler: ({ partes, body }) => {
        const actual = buscar(Number(partes[0])) ?? noEncontrado(op.ruta);
        Object.assign(actual, body, { [op.campoId]: actual[op.campoId] });
        return actual;
      },
    },
    {
      metodo: 'DELETE',
      patron: item,
      handler: ({ partes }) => {
        const idx = op.coleccion.findIndex((x) => x[op.campoId] === Number(partes[0]));
        if (idx === -1) noEncontrado(op.ruta);
        op.coleccion.splice(idx, 1);
        return { ok: true };
      },
    },
  ];
}
