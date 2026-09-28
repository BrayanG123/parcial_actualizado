/**
 * Sucursales, proveedores, usuarios, roles y empleados.
 * Endpoints esperados:
 *   GET/POST/PUT/DELETE /sucursales, /proveedores, /roles, /usuarios
 *   GET /empleados?id_sucursal
 *   GET /proveedores/:id/productos
 */
import { api } from '../../api/http';
import { endpoints } from '../endpoints';
import type { Paginado, ParamsPaginacion } from '../../types/api';
import type { Empleado, Producto, Proveedor, Rol, Sucursal, Usuario } from '../../types/domain';

export interface DatosUsuario {
  nombre: string;
  email: string;
  password?: string;
  activo: boolean;
  id_roles: number[];
  telefono?: string;
  direccion?: string;
  cargo?: string;
  id_sucursal?: number | null;
}

export interface FiltrosUsuario extends ParamsPaginacion {
  q?: string;
  id_rol?: number;
}

export const sucursalesService = {
  listar() {
    return api.get<Sucursal[]>(endpoints.sucursales.lista);
  },
  crear(datos: Omit<Sucursal, 'id_sucursal'>) {
    return api.post<Sucursal>(endpoints.sucursales.lista, datos);
  },
  actualizar(id: number, datos: Partial<Sucursal>) {
    return api.put<Sucursal>(endpoints.sucursales.detalle(id), datos);
  },
  eliminar(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.sucursales.detalle(id));
  },
};

export const proveedoresService = {
  listar() {
    return api.get<Proveedor[]>(endpoints.proveedores.lista);
  },
  crear(datos: Omit<Proveedor, 'id_proveedor'>) {
    return api.post<Proveedor>(endpoints.proveedores.lista, datos);
  },
  actualizar(id: number, datos: Partial<Proveedor>) {
    return api.put<Proveedor>(endpoints.proveedores.detalle(id), datos);
  },
  eliminar(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.proveedores.detalle(id));
  },
  productos(id: number) {
    return api.get<Producto[]>(endpoints.proveedores.productos(id));
  },
};

export const usuariosService = {
  listar(filtros: FiltrosUsuario = {}) {
    return api.get<Paginado<Usuario>>(endpoints.usuarios.lista, filtros);
  },
  obtener(id: number) {
    return api.get<Usuario>(endpoints.usuarios.detalle(id));
  },
  crear(datos: DatosUsuario) {
    return api.post<Usuario>(endpoints.usuarios.lista, datos);
  },
  actualizar(id: number, datos: Partial<DatosUsuario>) {
    return api.put<Usuario>(endpoints.usuarios.detalle(id), datos);
  },
  desactivar(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.usuarios.detalle(id));
  },
  empleados(idSucursal?: number) {
    return api.get<Empleado[]>(endpoints.usuarios.empleados, { id_sucursal: idSucursal });
  },
};

export const rolesService = {
  listar() {
    return api.get<Rol[]>(endpoints.usuarios.roles);
  },
  crear(datos: Omit<Rol, 'id_rol'>) {
    return api.post<Rol>(endpoints.usuarios.roles, datos);
  },
  actualizar(id: number, datos: Partial<Rol>) {
    return api.put<Rol>(endpoints.usuarios.rol(id), datos);
  },
  eliminar(id: number) {
    return api.delete<{ ok: boolean }>(endpoints.usuarios.rol(id));
  },
};
