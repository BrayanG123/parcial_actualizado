/**
 * Mantiene el estado del mock entre recargas de la pestana para que una
 * demostracion no pierda el carrito, las reservas ni las ventas creadas.
 * Solo aplica al mock: desaparece junto con esta carpeta al conectar NestJS.
 */
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
const VERSION = 2;

const colecciones_mutables = {
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

type Nombre = keyof typeof colecciones_mutables;

function reemplazar<T>(destino: T[], origen: T[]) {
  destino.splice(0, destino.length, ...origen);
}

export function restaurarEstado(): void {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return;
    const guardado = JSON.parse(crudo) as Record<string, unknown>;
    if (guardado.version !== VERSION) {
      sessionStorage.removeItem(CLAVE);
      return;
    }
    for (const nombre of Object.keys(colecciones_mutables) as Nombre[]) {
      const datos = guardado[nombre];
      if (Array.isArray(datos)) reemplazar(colecciones_mutables[nombre] as unknown[], datos);
    }
    if (guardado.secuencias) Object.assign(secuencias, guardado.secuencias);
  } catch {
    // Si el estado guardado es invalido se continua con los datos semilla.
    sessionStorage.removeItem(CLAVE);
  }
}

export function guardarEstado(): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ version: VERSION, ...colecciones_mutables, secuencias }));
  } catch {
    // El almacenamiento puede no estar disponible; el mock sigue funcionando en memoria.
  }
}
