import { RolNombre } from '../types/domain';
import type { Funcionalidades } from '../types/saas';

export interface EnlaceNav {
  a: string;
  texto: string;
  exacto?: boolean;
  /** Funcionalidad del plan necesaria; sin ella el enlace no se muestra. */
  requiere?: keyof Funcionalidades;
}

export interface GrupoNav {
  titulo: string;
  enlaces: EnlaceNav[];
}

const ADMIN: GrupoNav[] = [
  {
    titulo: 'General',
    enlaces: [
      { a: '/admin', texto: 'Dashboard', exacto: true },
      { a: '/admin/reportes', texto: 'Reportes', requiere: 'conventionalReports' },
      { a: '/admin/reportes-ia', texto: 'Reportes con IA', requiere: 'aiReports' },
      { a: '/admin/analitica', texto: 'Analitica ML', requiere: 'mlAnalytics' },
    ],
  },
  {
    titulo: 'Catalogo',
    enlaces: [
      { a: '/admin/productos', texto: 'Productos', requiere: 'products' },
      { a: '/admin/categorias', texto: 'Categorias', requiere: 'products' },
      { a: '/admin/tallas', texto: 'Tallas', requiere: 'products' },
      { a: '/admin/colores', texto: 'Colores', requiere: 'products' },
      { a: '/admin/temporadas', texto: 'Temporadas', requiere: 'products' },
      { a: '/admin/colecciones', texto: 'Colecciones', requiere: 'products' },
    ],
  },
  {
    titulo: 'Operaciones',
    enlaces: [
      { a: '/admin/inventario', texto: 'Inventario' },
      { a: '/admin/reservas', texto: 'Reservas', requiere: 'reservations' },
      { a: '/admin/ventas', texto: 'Ventas', requiere: 'sales' },
      { a: '/caja', texto: 'Punto de venta', exacto: true, requiere: 'sales' },
      { a: '/caja/turnos', texto: 'Turnos y arqueos', requiere: 'sales' },
      { a: '/caja/offline', texto: 'Ventas offline', requiere: 'offline' },
      { a: '/caja/pendientes', texto: 'Pendientes offline', requiere: 'offline' },
      { a: '/caja/cambios', texto: 'Cambios de prendas', requiere: 'sales' },
    ],
  },
  {
    titulo: 'Organizacion',
    enlaces: [
      { a: '/admin/sucursales', texto: 'Sucursales' },
      { a: '/admin/proveedores', texto: 'Proveedores' },
      { a: '/admin/usuarios', texto: 'Usuarios' },
      { a: '/admin/roles', texto: 'Roles' },
      { a: '/admin/plan', texto: 'Plan y suscripcion' },
    ],
  },
];

const SUCURSAL: GrupoNav[] = [
  {
    titulo: 'Mi sucursal',
    enlaces: [
      { a: '/sucursal/reservas', texto: 'Reservas', requiere: 'reservations' },
      { a: '/sucursal/inventario', texto: 'Inventario' },
      { a: '/sucursal/movimientos', texto: 'Movimientos' },
      { a: '/sucursal/ventas', texto: 'Ventas', requiere: 'sales' },
      { a: '/sucursal/reportes', texto: 'Reportes', requiere: 'conventionalReports' },
      { a: '/sucursal/reportes-ia', texto: 'Reportes con IA', requiere: 'aiReports' },
      { a: '/sucursal/analitica', texto: 'Analitica ML', requiere: 'mlAnalytics' },
      { a: '/caja', texto: 'Punto de venta', exacto: true, requiere: 'sales' },
      { a: '/caja/turnos', texto: 'Turnos y arqueos', requiere: 'sales' },
      { a: '/caja/offline', texto: 'Ventas offline', requiere: 'offline' },
      { a: '/caja/pendientes', texto: 'Pendientes offline', requiere: 'offline' },
      { a: '/caja/cambios', texto: 'Cambios de prendas', requiere: 'sales' },
    ],
  },
];

const CAJA: GrupoNav[] = [
  {
    titulo: 'Caja',
    enlaces: [
      { a: '/caja', texto: 'Punto de venta', exacto: true, requiere: 'sales' },
      { a: '/caja/turnos', texto: 'Turnos y arqueos', requiere: 'sales' },
      { a: '/caja/offline', texto: 'Ventas offline', requiere: 'offline' },
      { a: '/caja/pendientes', texto: 'Pendientes offline', requiere: 'offline' },
      { a: '/caja/cambios', texto: 'Cambios de prendas', requiere: 'sales' },
      { a: '/caja/ventas', texto: 'Historial de ventas', requiere: 'sales' },
    ],
  },
];

const PROVEEDOR: GrupoNav[] = [
  {
    titulo: 'Proveedor',
    enlaces: [
      { a: '/proveedor/productos', texto: 'Mis productos', requiere: 'products' },
      { a: '/proveedor/entregas', texto: 'Entregas programadas' },
    ],
  },
];

/**
 * Un usuario puede tener varios roles: se concatenan sus secciones. Los enlaces de
 * funciones que el plan no incluye se ocultan (el backend las bloquea igualmente; ver
 * `backend/src/common/security/route-access.spec.ts`).
 */
export function navegacionPorRol(
  roles: string[],
  tieneFuncion: (funcion: keyof Funcionalidades) => boolean = () => true,
): GrupoNav[] {
  const grupos: GrupoNav[] = [];
  if (roles.includes(RolNombre.ADMINISTRADOR)) grupos.push(...ADMIN);
  if (roles.includes(RolNombre.ENCARGADO_SUCURSAL)) grupos.push(...SUCURSAL);
  if (roles.includes(RolNombre.CAJERO)) grupos.push(...CAJA);
  if (roles.includes(RolNombre.PROVEEDOR)) grupos.push(...PROVEEDOR);
  return grupos
    .map((grupo) => ({
      ...grupo,
      enlaces: grupo.enlaces.filter((e) => !e.requiere || tieneFuncion(e.requiere)),
    }))
    .filter((grupo) => grupo.enlaces.length > 0);
}
