import type {
  EmpresaPlataforma,
  EstadoSuscripcion,
  Funcionalidades,
  MovimientoSuscripcion,
  Plan,
  PlanEmpresa,
} from '../types/saas';

export interface PlanBackend {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  maxActiveBranches: number;
  features: Funcionalidades | null;
  monthlyPrice?: string | number;
  active?: boolean;
}

interface SuscripcionBackend {
  id: number;
  status: EstadoSuscripcion;
  startsAt: string;
  endsAt: string;
  daysRemaining?: number;
}

export interface PlanEmpresaBackend {
  tenant: { id: number; slug: string; name: string } | null;
  plan: PlanBackend | null;
  subscription: SuscripcionBackend | null;
  readOnly: boolean;
  usage: { activeBranches: number; branches: number; users: number; remainingBranches: number };
}

export interface EmpresaPlataformaBackend {
  id: number;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'INACTIVE';
  subscription: (SuscripcionBackend & { plan: PlanBackend }) | null;
  usage: { activeBranches: number; branches: number; users: number };
}

export interface MovimientoBackend {
  id: number;
  action: string;
  fromPlan?: { code: string; name: string } | null;
  toPlan: { code: string; name: string };
  status: EstadoSuscripcion;
  startsAt: string;
  endsAt: string;
  note?: string | null;
  createdAt: string;
}

export function adaptarPlan(plan: PlanBackend): Plan {
  return {
    id: plan.id,
    codigo: plan.code,
    nombre: plan.name,
    descripcion: plan.description,
    max_sucursales_activas: plan.maxActiveBranches,
    funcionalidades: plan.features ?? {},
    precio_mensual: plan.monthlyPrice == null ? undefined : Number(plan.monthlyPrice),
    activo: plan.active,
  };
}

const adaptarSuscripcion = (s: SuscripcionBackend) => ({
  id: s.id,
  estado: s.status,
  inicio: s.startsAt,
  vencimiento: s.endsAt,
  dias_restantes: s.daysRemaining,
});

export function adaptarPlanEmpresa(datos: PlanEmpresaBackend): PlanEmpresa {
  return {
    empresa: datos.tenant && { id: datos.tenant.id, slug: datos.tenant.slug, nombre: datos.tenant.name },
    plan: datos.plan && adaptarPlan(datos.plan),
    suscripcion: datos.subscription && adaptarSuscripcion(datos.subscription),
    solo_lectura: datos.readOnly,
    uso: {
      sucursales_activas: datos.usage.activeBranches,
      sucursales: datos.usage.branches,
      usuarios: datos.usage.users,
      sucursales_disponibles: datos.usage.remainingBranches,
    },
  };
}

export function adaptarEmpresaPlataforma(e: EmpresaPlataformaBackend): EmpresaPlataforma {
  return {
    id: e.id,
    nombre: e.name,
    slug: e.slug,
    estado: e.status,
    suscripcion: e.subscription && {
      ...adaptarSuscripcion(e.subscription),
      plan: adaptarPlan(e.subscription.plan),
    },
    uso: {
      sucursales_activas: e.usage.activeBranches,
      sucursales: e.usage.branches,
      usuarios: e.usage.users,
    },
  };
}

export function adaptarMovimiento(m: MovimientoBackend): MovimientoSuscripcion {
  return {
    id: m.id,
    accion: m.action,
    plan_anterior: m.fromPlan?.name,
    plan_nuevo: m.toPlan.name,
    estado: m.status,
    inicio: m.startsAt,
    vencimiento: m.endsAt,
    observacion: m.note,
    fecha: m.createdAt,
  };
}
