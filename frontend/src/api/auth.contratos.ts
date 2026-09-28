import { RolNombre, type Usuario } from '../types/domain';

export const ROLES_BACKEND = {
  ADMINISTRATOR: RolNombre.ADMINISTRADOR,
  BRANCH_MANAGER: RolNombre.ENCARGADO_SUCURSAL,
  CASHIER: RolNombre.CAJERO,
  CUSTOMER: RolNombre.CLIENTE,
  SUPPLIER: RolNombre.PROVEEDOR,
} as const;

export type RolBackend = keyof typeof ROLES_BACKEND;

export interface UsuarioBackend {
  supplier?: { id: number; name: string; active: boolean } | null;
  id: number;
  name: string;
  email: string;
  active: boolean;
  registeredAt: string;
  roles: Array<{ role: { id: number; name: RolBackend; description: string | null } }>;
  client: { wholesale?: boolean; id: number; phone: string | null; address: string | null } | null;
  employee: {
    id: number;
    jobTitle: string;
    branchId: number;
    active: boolean;
    branch: {
      id: number;
      name: string;
      city: string;
      address: string;
      phone: string | null;
      active: boolean;
    };
  } | null;
}

export interface SesionBackend {
  accessToken: string;
  tokenType: 'Bearer';
  user: UsuarioBackend;
}

export interface RegistroBackend {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

/** El dominio de la UI permanece en español; el transporte respeta NestJS. */
export function adaptarUsuario(user: UsuarioBackend): Usuario {
  const branch = user.employee?.branch;
  return {
    id_usuario: user.id,
    nombre: user.name,
    email: user.email,
    activo: user.active,
    fecha_registro: user.registeredAt,
    id_proveedor: user.supplier?.id,
    proveedor_nombre: user.supplier?.name,
    proveedor_activo: user.supplier?.active,
    roles: user.roles.map(({ role }) => ({
      id_rol: role.id,
      nombre: ROLES_BACKEND[role.name] ?? role.name,
      descripcion: role.description ?? '',
    })),
    ...(user.client
      ? {
          id_cliente: user.client.id,
          mayorista: user.client.wholesale ?? false,
          telefono: user.client.phone ?? '',
          direccion: user.client.address ?? '',
        }
      : {}),
    ...(user.employee
      ? {
          id_empleado: user.employee.id,
          cargo: user.employee.jobTitle,
          id_sucursal: user.employee.branchId,
          sucursal: branch
            ? {
                id_sucursal: branch.id,
                nombre: branch.name,
                ciudad: branch.city,
                direccion: branch.address,
                telefono: branch.phone ?? '',
                activa: branch.active,
              }
            : null,
        }
      : {}),
  };
}
