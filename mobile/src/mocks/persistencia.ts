/**
 * Mantiene el estado del mock entre reinicios de la app para que una
 * demostracion no pierda el carrito, las reservas ni las compras creadas.
 * Solo aplica al mock: desaparece junto con esta carpeta al conectar NestJS.
 */
import { borrarClave, guardarJSON, leerJSON } from '../api/almacenamiento';
import {
  carritos,
  categorias,
  colecciones,
  colores,
  inventario,
  movimientos,
  productos,
  proveedores,
  reservas,
  roles,
  secuencias,
  sucursales,
  tallas,
  temporadas,
  usuarios,
  ventas,
} from './db';

const CLAVE = 'fashionstore.mock.estado';
/** Subir esta version descarta estados guardados con semillas antiguas. */
const VERSION = 1;

const coleccionesMutables = {
  usuarios,
  roles,
  sucursales,
  categorias,
  temporadas,
  colecciones,
  proveedores,
  tallas,
  colores,
  productos,
  inventario,
  movimientos,
  reservas,
  carritos,
  ventas,
} as const;

type Nombre = keyof typeof coleccionesMutables;

function reemplazar<T>(destino: T[], origen: T[]) {
  destino.splice(0, destino.length, ...origen);
}

export async function restaurarEstado(): Promise<void> {
  const guardado = await leerJSON<Record<string, unknown>>(CLAVE);
  if (!guardado) return;
  if (guardado.version !== VERSION) {
    await borrarClave(CLAVE);
    return;
  }
  for (const nombre of Object.keys(coleccionesMutables) as Nombre[]) {
    const datos = guardado[nombre];
    if (Array.isArray(datos)) reemplazar(coleccionesMutables[nombre] as unknown[], datos);
  }
  if (guardado.secuencias) Object.assign(secuencias, guardado.secuencias);
}

/**
 * Escritura diferida: varias mutaciones seguidas (agregar tres prendas al
 * carrito) se guardan una sola vez en lugar de serializar el estado completo
 * en cada llamada.
 */
let pendiente: ReturnType<typeof setTimeout> | null = null;

export function guardarEstado(): void {
  if (pendiente) clearTimeout(pendiente);
  pendiente = setTimeout(() => {
    pendiente = null;
    void guardarJSON(CLAVE, { version: VERSION, ...coleccionesMutables, secuencias });
  }, 400);
}

export async function reiniciarMock(): Promise<void> {
  if (pendiente) clearTimeout(pendiente);
  pendiente = null;
  await borrarClave(CLAVE);
}
