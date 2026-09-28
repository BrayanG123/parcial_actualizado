import { api } from '../api/http';
import { USAR_MOCKS } from '../api/config';
import { endpoints } from '../api/endpoints';
import { adaptarPagina, todasLasPaginas, type PaginaBackend } from '../api/contratos';
import {
  adaptarUsuario,
  ROLES_BACKEND,
  type RolBackend,
  type UsuarioBackend,
} from '../api/auth.contratos';
import {
  adaptarProveedor,
  adaptarSucursal,
  type ProveedorBackend,
  type SucursalBackend,
} from '../api/catalogo.contratos';
import { ErrorApi, type ParamsPaginacion } from '../types/api';
import type { Proveedor, Rol, Sucursal } from '../types/domain';
import * as mock from '../mocks/servicios/organizacion';
import { catalogoService } from './catalogo.service';

export interface DatosUsuario {
  id_proveedor?: number | null;
  mayorista?: boolean;
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
  activo?: boolean;
}
interface DefinicionRolBackend {
  id: number;
  name: RolBackend;
  description: string | null;
}

async function listarSucursales(active: boolean) {
  return (
    await todasLasPaginas((page, limit) =>
      api.get<PaginaBackend<SucursalBackend>>(endpoints.sucursales.lista, { page, limit, active }),
    )
  ).map(adaptarSucursal);
}
const sucursalDto = (d: Partial<Sucursal>, crear = false) => ({
  name: d.nombre?.trim(),
  city: d.ciudad?.trim(),
  warehouseName: d.nombre_almacen?.trim(),
  address: d.direccion?.trim(),
  phone: d.telefono,
  ...(!crear ? { active: d.activa } : {}),
});
export const sucursalesService = USAR_MOCKS
  ? {
      ...mock.sucursalesService,
      listar: async () => (await mock.sucursalesService.listar()).filter((s) => s.activa),
      listarTodas: mock.sucursalesService.listar,
    }
  : {
      listar: () => listarSucursales(true),
      listarTodas: async () =>
        (await Promise.all([listarSucursales(true), listarSucursales(false)]))
          .flat()
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      crear: async (d: Omit<Sucursal, 'id_sucursal'>) =>
        adaptarSucursal(
          await api.post<SucursalBackend>(endpoints.sucursales.lista, sucursalDto(d, true)),
        ),
      actualizar: async (id: number, d: Partial<Sucursal>) =>
        adaptarSucursal(
          await api.patch<SucursalBackend>(endpoints.sucursales.detalle(id), sucursalDto(d)),
        ),
      eliminar: (id: number) => api.delete<unknown>(endpoints.sucursales.detalle(id)),
    };
const proveedorDto = (d: Partial<Proveedor>, crear = false) => ({
  name: d.nombre?.trim(),
  contact: d.contacto,
  phone: d.telefono,
  email: d.email === undefined ? undefined : d.email.trim() || null,
  ...(!crear ? { active: d.activo } : {}),
});
export const proveedoresService = USAR_MOCKS
  ? mock.proveedoresService
  : {
      listar: async () =>
        (await api.get<ProveedorBackend[]>(endpoints.proveedores.lista)).map(adaptarProveedor),
      crear: async (d: Omit<Proveedor, 'id_proveedor'>) =>
        adaptarProveedor(
          await api.post<ProveedorBackend>(endpoints.proveedores.lista, proveedorDto(d, true)),
        ),
      actualizar: async (id: number, d: Partial<Proveedor>) =>
        adaptarProveedor(
          await api.patch<ProveedorBackend>(endpoints.proveedores.detalle(id), proveedorDto(d)),
        ),
      eliminar: (id: number) => api.delete<unknown>(endpoints.proveedores.detalle(id)),
      productos: async (id: number) =>
        (
          await catalogoService.listarProductos({
            id_proveedor: id,
            incluir_inactivos: true,
            page_size: Number.MAX_SAFE_INTEGER,
          })
        ).items,
    };

export function nombreRolBackend(rol: Rol): RolBackend {
  const nombre = (Object.keys(ROLES_BACKEND) as RolBackend[]).find(
    (key) => ROLES_BACKEND[key] === rol.nombre,
  );
  if (!nombre) throw new ErrorApi('El rol seleccionado no esta reconocido por el servidor.', 400);
  return nombre;
}
export const rolesService = {
  listar: async (): Promise<Rol[]> =>
    USAR_MOCKS
      ? mock.rolesService.listar()
      : (await api.get<DefinicionRolBackend[]>(endpoints.usuarios.roles)).map((r) => ({
          id_rol: r.id,
          nombre: ROLES_BACKEND[r.name],
          descripcion: r.description ?? '',
        })),
  asignar: async (id: number, rol: Rol, perfil: Partial<DatosUsuario> = {}) => {
    if (USAR_MOCKS) {
      const usuario = await mock.usuariosService.obtener(id);
      return mock.usuariosService.actualizar(id, {
        ...perfil,
        id_roles: [...new Set([...usuario.roles.map((r) => r.id_rol), rol.id_rol])],
      });
    }
    const nombre = nombreRolBackend(rol);
    const cliente = nombre === 'CUSTOMER';
    const empleado = nombre === 'CASHIER' || nombre === 'BRANCH_MANAGER';
    return adaptarUsuario(
      await api.post<UsuarioBackend>(endpoints.usuarios.asignacion(id, nombre), {
        ...(cliente ? { phone: perfil.telefono, address: perfil.direccion } : {}),
        ...(empleado
          ? { branchId: perfil.id_sucursal || undefined, jobTitle: perfil.cargo || undefined }
          : {}),
      }),
    );
  },
  revocar: async (id: number, rol: Rol) => {
    if (USAR_MOCKS) {
      const usuario = await mock.usuariosService.obtener(id);
      return mock.usuariosService.actualizar(id, {
        id_roles: usuario.roles.filter((r) => r.id_rol !== rol.id_rol).map((r) => r.id_rol),
      });
    }
    return adaptarUsuario(
      await api.delete<UsuarioBackend>(endpoints.usuarios.asignacion(id, nombreRolBackend(rol))),
    );
  },
};

export function usuarioParaApi(
  d: Partial<DatosUsuario>,
  perfiles: { cliente: boolean; empleado: boolean; proveedor?: boolean },
) {
  return {
    name: d.nombre?.trim(),
    email: d.email?.trim(),
    password: d.password || undefined,
    active: d.activo,
    ...(perfiles.proveedor ? { supplierId: d.id_proveedor } : {}),
    ...(perfiles.cliente
      ? { phone: d.telefono, address: d.direccion, wholesale: d.mayorista }
      : {}),
    ...(perfiles.empleado
      ? { branchId: d.id_sucursal || undefined, jobTitle: d.cargo || undefined }
      : {}),
  };
}
export const usuariosService = USAR_MOCKS
  ? mock.usuariosService
  : {
      listar: async (f: FiltrosUsuario = {}) => {
        const rol = f.id_rol
          ? (await rolesService.listar()).find((r) => r.id_rol === f.id_rol)
          : undefined;
        if (f.id_rol && !rol) throw new ErrorApi('El rol seleccionado ya no existe.', 400);
        return adaptarPagina(
          await api.get<PaginaBackend<UsuarioBackend>>(endpoints.usuarios.lista, {
            search: f.q,
            role: rol ? nombreRolBackend(rol) : undefined,
            active: f.activo,
            page: f.page ?? 1,
            limit: f.page_size ?? 20,
          }),
          adaptarUsuario,
        );
      },
      obtener: async (id: number) =>
        adaptarUsuario(await api.get<UsuarioBackend>(endpoints.usuarios.detalle(id))),
      crear: async (d: DatosUsuario) => {
        const disponibles = await rolesService.listar();
        const roles = d.id_roles.map((id) => {
          const rol = disponibles.find((r) => r.id_rol === id);
          if (!rol) throw new ErrorApi('El rol seleccionado ya no existe.', 400);
          return nombreRolBackend(rol);
        });
        return adaptarUsuario(
          await api.post<UsuarioBackend>(endpoints.usuarios.lista, {
            ...usuarioParaApi(d, {
              cliente: roles.includes('CUSTOMER'),
              proveedor: roles.includes('SUPPLIER'),
              empleado: roles.some((r) => r === 'CASHIER' || r === 'BRANCH_MANAGER'),
            }),
            roles,
          }),
        );
      },
      actualizar: async (id: number, d: Partial<DatosUsuario>) => {
        // Los perfiles existentes pueden sobrevivir a la revocacion de un rol.
        const actual = await api.get<UsuarioBackend>(endpoints.usuarios.detalle(id));
        return adaptarUsuario(
          await api.patch<UsuarioBackend>(
            endpoints.usuarios.detalle(id),
            usuarioParaApi(d, {
              cliente: Boolean(actual.client),
              proveedor: Boolean(actual.supplier) || actual.roles.some(r => r.role.name === 'SUPPLIER'),
              empleado: Boolean(actual.employee),
            }),
          ),
        );
      },
      desactivar: (id: number) => api.delete<unknown>(endpoints.usuarios.detalle(id)),
    };
