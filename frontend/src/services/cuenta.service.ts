/** Cuenta de dueño (F14): sus empresas, crear otra y entrar a una de ellas. */
import { apiCuenta, guardarTokenCuenta } from '../api/http';
import type { CobroSuscripcion } from './suscripcion.service';
import { endpoints } from '../api/endpoints';
import { ErrorApi } from '../types/api';

export interface CuentaDueno {
  id: number;
  nombre: string;
  email: string;
}

export interface EmpresaDueno {
  id: number;
  slug: string;
  nombre: string;
  activa: boolean;
  plan: { codigo: string; nombre: string; precio_mensual: number; max_sucursales: number } | null;
  suscripcion: { estado: string; vence: string; solo_lectura: boolean } | null;
  estadisticas: {
    sucursales: number;
    sucursales_activas: number;
    personal: number;
    clientes: number;
    prendas: number;
    reservas_abiertas: number;
    ventas_mes: { cantidad: number; total: number; moneda: string };
  };
}

interface EmpresaDuenoBackend {
  id: number;
  slug: string;
  name: string;
  status: string;
  subscription: {
    status: string;
    endsAt: string;
    readOnly: boolean;
    plan: { code: string; name: string; monthlyPrice: number; maxActiveBranches: number };
  } | null;
  stats: {
    branches: number;
    activeBranches: number;
    staff: number;
    customers: number;
    products: number;
    openReservations: number;
    salesThisMonth: { count: number; total: number; currency: string };
  };
}

const adaptar = (e: EmpresaDuenoBackend): EmpresaDueno => ({
  id: e.id,
  slug: e.slug,
  nombre: e.name,
  activa: e.status === 'ACTIVE',
  plan: e.subscription && {
    codigo: e.subscription.plan.code,
    nombre: e.subscription.plan.name,
    precio_mensual: Number(e.subscription.plan.monthlyPrice),
    max_sucursales: e.subscription.plan.maxActiveBranches,
  },
  suscripcion: e.subscription && {
    estado: e.subscription.status,
    vence: e.subscription.endsAt,
    solo_lectura: e.subscription.readOnly,
  },
  estadisticas: {
    sucursales: e.stats.branches,
    sucursales_activas: e.stats.activeBranches,
    personal: e.stats.staff,
    clientes: e.stats.customers,
    prendas: e.stats.products,
    reservas_abiertas: e.stats.openReservations,
    ventas_mes: {
      cantidad: e.stats.salesThisMonth.count,
      total: Number(e.stats.salesThisMonth.total),
      moneda: e.stats.salesThisMonth.currency,
    },
  },
});

export const cuentaService = {
  async login(email: string, password: string): Promise<CuentaDueno> {
    const sesion = await apiCuenta.post<{
      accessToken: string;
      tokenType: string;
      account: { id: number; name: string; email: string };
    }>(endpoints.cuenta.login, { email: email.trim().toLowerCase(), password });
    if (!sesion.accessToken || sesion.tokenType !== 'Bearer')
      throw new ErrorApi('El servidor no devolvio una sesion valida.', 502);
    guardarTokenCuenta(sesion.accessToken);
    return { id: sesion.account.id, nombre: sesion.account.name, email: sesion.account.email };
  },

  async perfil(): Promise<CuentaDueno> {
    const c = await apiCuenta.get<{ id: number; name: string; email: string }>(endpoints.cuenta.perfil);
    return { id: c.id, nombre: c.name, email: c.email };
  },

  async empresas(): Promise<EmpresaDueno[]> {
    return (await apiCuenta.get<EmpresaDuenoBackend[]>(endpoints.cuenta.empresas)).map(adaptar);
  },

  /** Plan gratuito: crea la empresa. Plan de pago: devuelve el cobro a completar con Stripe. */
  crearEmpresa(datos: { nombre: string; slug: string; plan: string }) {
    return apiCuenta.post<{ id: number; slug: string; name: string } | CobroSuscripcion>(endpoints.cuenta.empresas, {
      name: datos.nombre.trim(),
      slug: datos.slug.trim().toLowerCase(),
      planCode: datos.plan,
    });
  },

  salir() {
    guardarTokenCuenta(null);
  },
};
