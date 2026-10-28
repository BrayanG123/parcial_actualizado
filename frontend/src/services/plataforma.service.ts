/** Administracion de la plataforma SaaS (rol PLATFORM_ADMIN). */
import { apiPlataforma, guardarTokenPlataforma } from '../api/http';
import { endpoints } from '../api/endpoints';
import {
  adaptarEmpresaPlataforma,
  adaptarMovimiento,
  adaptarPlan,
  type EmpresaPlataformaBackend,
  type MovimientoBackend,
  type PlanBackend,
} from '../api/saas.contratos';
import type { SesionBackend } from '../api/auth.contratos';
import { ErrorApi } from '../types/api';
import type { EmpresaPlataforma, Funcionalidades, MovimientoSuscripcion, Plan } from '../types/saas';

export interface NuevaEmpresa {
  nombre: string;
  slug: string;
  codigo_plan: string;
  meses: number;
  admin: { nombre: string; email: string; password: string };
}

export interface CambiosPlan {
  nombre?: string;
  max_sucursales_activas?: number;
  funcionalidades?: Funcionalidades;
  activo?: boolean;
}

const empresa = (e: EmpresaPlataformaBackend) => adaptarEmpresaPlataforma(e);

export const plataformaService = {
  async login(email: string, password: string): Promise<string> {
    const sesion = await apiPlataforma.post<SesionBackend>(endpoints.plataforma.login, {
      email: email.trim().toLowerCase(),
      password,
    });
    const esPlataforma = sesion.user?.roles.some(({ role }) => String(role.name) === 'PLATFORM_ADMIN');
    if (!sesion.accessToken || !esPlataforma) {
      throw new ErrorApi('La cuenta no es de administrador de plataforma.', 403);
    }
    guardarTokenPlataforma(sesion.accessToken);
    return sesion.user.name;
  },

  logout(): void {
    guardarTokenPlataforma(null);
  },

  async empresas(): Promise<EmpresaPlataforma[]> {
    return (await apiPlataforma.get<EmpresaPlataformaBackend[]>(endpoints.plataforma.empresas)).map(empresa);
  },

  async crearEmpresa(datos: NuevaEmpresa): Promise<EmpresaPlataforma> {
    return empresa(
      await apiPlataforma.post<EmpresaPlataformaBackend>(endpoints.plataforma.empresas, {
        name: datos.nombre.trim(),
        slug: datos.slug.trim().toLowerCase(),
        planCode: datos.codigo_plan,
        months: datos.meses,
        admin: {
          name: datos.admin.nombre.trim(),
          email: datos.admin.email.trim().toLowerCase(),
          password: datos.admin.password,
        },
      }),
    );
  },

  async cambiarEstado(id: number, estado: 'ACTIVE' | 'INACTIVE'): Promise<EmpresaPlataforma> {
    return empresa(await apiPlataforma.patch<EmpresaPlataformaBackend>(endpoints.plataforma.empresa(id), { status: estado }));
  },

  async cambiarPlan(id: number, codigo: string, nota?: string): Promise<EmpresaPlataforma> {
    return empresa(
      await apiPlataforma.patch<EmpresaPlataformaBackend>(endpoints.plataforma.cambiarPlan(id), {
        planCode: codigo,
        ...(nota ? { note: nota } : {}),
      }),
    );
  },

  async renovar(id: number, meses: number): Promise<EmpresaPlataforma> {
    return empresa(await apiPlataforma.post<EmpresaPlataformaBackend>(endpoints.plataforma.renovar(id), { months: meses }));
  },

  async suspender(id: number, nota?: string): Promise<EmpresaPlataforma> {
    return empresa(
      await apiPlataforma.post<EmpresaPlataformaBackend>(endpoints.plataforma.suspender(id), nota ? { note: nota } : {}),
    );
  },

  async reactivar(id: number): Promise<EmpresaPlataforma> {
    return empresa(await apiPlataforma.post<EmpresaPlataformaBackend>(endpoints.plataforma.reactivar(id), {}));
  },

  async historial(id: number): Promise<MovimientoSuscripcion[]> {
    return (await apiPlataforma.get<MovimientoBackend[]>(endpoints.plataforma.historial(id))).map(adaptarMovimiento);
  },

  async planes(): Promise<Plan[]> {
    return (await apiPlataforma.get<PlanBackend[]>(endpoints.plataforma.planes)).map(adaptarPlan);
  },

  async actualizarPlan(id: number, cambios: CambiosPlan): Promise<Plan> {
    return adaptarPlan(
      await apiPlataforma.patch<PlanBackend>(endpoints.plataforma.plan(id), {
        ...(cambios.nombre ? { name: cambios.nombre } : {}),
        ...(cambios.max_sucursales_activas ? { maxActiveBranches: cambios.max_sucursales_activas } : {}),
        ...(cambios.funcionalidades ? { features: cambios.funcionalidades } : {}),
        ...(cambios.activo !== undefined ? { active: cambios.activo } : {}),
      }),
    );
  },
};
