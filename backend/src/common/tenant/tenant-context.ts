import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de empresa (tenant) de la peticion o tarea en curso.
 *
 * - `tenantId`: empresa con la que se filtran lecturas y escrituras de Prisma.
 * - `system`: tareas internas (jobs, webhook, plataforma) que deben ver todas las
 *   empresas. Solo se activa explicitamente con `runAsSystem`.
 * - `source`: de donde salio el tenant (header publico, slug por defecto, JWT).
 */
export interface TenantStore {
  tenantId: number | null;
  tenantSlug?: string;
  system: boolean;
  source: 'header' | 'default' | 'jwt' | 'system' | 'explicit' | 'none';
  /** Usuario autenticado de plataforma (sin empresa). */
  platformAdmin?: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context required for ${model}.${operation}; use runInTenant or runAsSystem`,
    );
    this.name = 'MissingTenantContextError';
  }
}

export const tenantContext = {
  getStore(): TenantStore | undefined {
    return storage.getStore();
  },

  run<T>(store: TenantStore, callback: () => T): T {
    return storage.run(store, callback);
  },

  /**
   * Ejecuta `callback` restringido a una empresa. Espera el resultado dentro del
   * contexto: las consultas de Prisma son diferidas y se ejecutan al hacer `then`.
   */
  runInTenant<T>(tenantId: number, callback: () => T): Promise<Awaited<T>> {
    return storage.run(
      { tenantId, system: false, source: 'explicit' },
      async (): Promise<Awaited<T>> => await callback(),
    );
  },

  /** Ejecuta `callback` sin filtro de empresa (jobs y administracion de plataforma). */
  runAsSystem<T>(callback: () => T): Promise<Awaited<T>> {
    return storage.run(
      { tenantId: null, system: true, source: 'system' },
      async (): Promise<Awaited<T>> => await callback(),
    );
  },

  currentTenantId(): number | null {
    return storage.getStore()?.tenantId ?? null;
  },

  /** Empresa actual o error si la peticion no tiene empresa. */
  requireTenantId(): number {
    const tenantId = storage.getStore()?.tenantId;
    if (tenantId === null || tenantId === undefined) {
      throw new MissingTenantContextError('tenant', 'require');
    }
    return tenantId;
  },
};
