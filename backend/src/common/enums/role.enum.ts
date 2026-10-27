export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  ADMINISTRATOR = 'ADMINISTRATOR',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  CASHIER = 'CASHIER',
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
}

/** Roles que una empresa puede asignar; PLATFORM_ADMIN solo lo crea la plataforma. */
export const TENANT_ROLES = Object.values(Role).filter(
  (role) => role !== Role.PLATFORM_ADMIN,
);
