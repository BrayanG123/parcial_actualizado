/** Empresa (tenant) de la tienda y plan de la empresa del usuario. */
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarPlanEmpresa, type PlanEmpresaBackend } from '../api/saas.contratos';
import type { EmpresaResumen, PlanEmpresa } from '../types/saas';

export const empresaService = {
  async directorio(): Promise<EmpresaResumen[]> {
    const lista = await api.get<Array<{ slug: string; name: string }>>(endpoints.empresa.directorio);
    return lista.map((e) => ({ slug: e.slug, nombre: e.name }));
  },

  /** Empresa que resuelve el backend para el X-Tenant enviado (404 si no existe). */
  async publica(): Promise<EmpresaResumen> {
    const e = await api.get<{ id: number; slug: string; name: string }>(endpoints.empresa.publica);
    return { id: e.id, slug: e.slug, nombre: e.name };
  },

  async plan(): Promise<PlanEmpresa> {
    return adaptarPlanEmpresa(await api.get<PlanEmpresaBackend>(endpoints.empresa.suscripcion));
  },
};
