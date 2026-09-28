import { RolNombre, type Cliente, type Usuario } from '../types/domain';

export const ROLES_BACKEND = {
  ADMINISTRATOR: RolNombre.ADMINISTRADOR,
  BRANCH_MANAGER: RolNombre.ENCARGADO_SUCURSAL,
  CASHIER: RolNombre.CAJERO,
  CUSTOMER: RolNombre.CLIENTE,
  SUPPLIER: RolNombre.PROVEEDOR,
} as const;

export type RolBackend = keyof typeof ROLES_BACKEND;

export interface UsuarioBackend {
  id: number;
  name: string;
  email: string;
  active: boolean;
  registeredAt: string;
  roles: Array<{ role: { id: number; name: RolBackend; description: string | null } }>;
  client: { wholesale?: boolean; id: number; phone: string | null; address: string | null } | null;
}

export interface SesionBackend {
  accessToken: string;
  tokenType: 'Bearer';
  user: UsuarioBackend;
}

/** La app es para clientes: la cuenta sin perfil de cliente se trata como Usuario. */
export function adaptarUsuario(user: UsuarioBackend): Usuario | Cliente {
  const base: Usuario = {
    id_usuario: user.id,
    nombre: user.name,
    email: user.email,
    activo: user.active,
    fecha_registro: user.registeredAt,
    roles: user.roles.map(({ role }) => ({
      id_rol: role.id,
      nombre: ROLES_BACKEND[role.name] ?? role.name,
      descripcion: role.description ?? '',
    })),
  };
  if (!user.client) return base;
  return {
    ...base,
    id_cliente: user.client.id,
    telefono: user.client.phone ?? '',
    direccion: user.client.address ?? '',
    mayorista: user.client.wholesale ?? false,
  };
}
