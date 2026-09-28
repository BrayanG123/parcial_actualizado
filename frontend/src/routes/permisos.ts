/**
 * Unica fuente de verdad de que rol puede entrar a cada area de la aplicacion.
 * La usan el router (guards) y el login (redireccion posterior).
 * Es UX: la autorizacion real la resuelve el backend en cada peticion.
 */
import { RolNombre } from '../types/domain';

const { ADMINISTRADOR, ENCARGADO_SUCURSAL, CAJERO, CLIENTE, PROVEEDOR } = RolNombre;

export const ROLES_AREA = {
  admin: [ADMINISTRADOR],
  sucursal: [ENCARGADO_SUCURSAL, ADMINISTRADOR],
  caja: [CAJERO, ENCARGADO_SUCURSAL, ADMINISTRADOR],
  proveedor: [PROVEEDOR, ADMINISTRADOR],
  cliente: [CLIENTE],
} as const;

const AREAS: Array<{ prefijo: string; roles: readonly string[] }> = [
  { prefijo: '/admin', roles: ROLES_AREA.admin },
  { prefijo: '/sucursal', roles: ROLES_AREA.sucursal },
  { prefijo: '/caja', roles: ROLES_AREA.caja },
  { prefijo: '/proveedor', roles: ROLES_AREA.proveedor },
  { prefijo: '/carrito', roles: ROLES_AREA.cliente },
  { prefijo: '/checkout', roles: ROLES_AREA.cliente },
  { prefijo: '/mis-compras', roles: ROLES_AREA.cliente },
  { prefijo: '/mis-reservas', roles: ROLES_AREA.cliente },
  { prefijo: '/reservas/nueva', roles: ROLES_AREA.cliente },
];

/** Indica si un usuario con esos roles puede abrir la ruta indicada. */
export function puedeAcceder(ruta: string, roles: string[]): boolean {
  if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('\\')) return false;
  ruta = ruta.split(/[?#]/)[0];
  const area = AREAS.find((a) => ruta === a.prefijo || ruta.startsWith(`${a.prefijo}/`) || ruta.startsWith(`${a.prefijo}?`));
  if (!area) return true;
  return area.roles.some((r) => roles.includes(r));
}

/** Ruta a la que se envia a cada rol tras iniciar sesion. */
export function rutaInicialPorRol(roles: string[]): string {
  if (roles.includes(ADMINISTRADOR)) return '/admin';
  if (roles.includes(ENCARGADO_SUCURSAL)) return '/sucursal/reservas';
  if (roles.includes(CAJERO)) return '/caja';
  if (roles.includes(PROVEEDOR)) return '/proveedor/productos';
  return '/';
}
