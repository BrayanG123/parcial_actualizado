/**
 * Demo sin backend del modulo SaaS: dos empresas, planes y suscripciones en memoria.
 * El aislamiento real lo hace NestJS; el mock solo permite recorrer las pantallas.
 */
import { ErrorApi } from '../../types/api';
import { sucursales } from '../db';
import { invalido, requiereSesion, type RutaMock } from '../core';

const ahora = () => new Date().toISOString();
const enMeses = (meses: number, desde = new Date()) => {
  const fecha = new Date(desde);
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha.toISOString();
};

const planes = [
  {
    id: 1,
    code: 'BASIC',
    name: 'Basico',
    description: 'Hasta 2 sucursales activas, sin IA',
    maxActiveBranches: 2,
    features: { products: true, sales: true, reservations: true, offline: true, conventionalReports: true, aiReports: false, mlAnalytics: false },
    active: true,
  },
  {
    id: 2,
    code: 'PROFESSIONAL',
    name: 'Profesional',
    description: 'Hasta 10 sucursales activas, con IA',
    maxActiveBranches: 10,
    features: { products: true, sales: true, reservations: true, offline: true, conventionalReports: true, aiReports: true, mlAnalytics: true },
    active: true,
  },
];

type EstadoMock = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
const empresas = [
  { id: 1, name: 'FashionStore', slug: 'fashionstore', status: 'ACTIVE', planId: 2, estado: 'ACTIVE' as EstadoMock, startsAt: ahora(), endsAt: enMeses(12) },
  { id: 2, name: 'Moda Andina (Empresa B)', slug: 'empresa-b', status: 'ACTIVE', planId: 1, estado: 'ACTIVE' as EstadoMock, startsAt: ahora(), endsAt: enMeses(12) },
];
const historial: Array<{ id: number; empresa: number; action: string; from: number | null; to: number; at: string }> = [];

const plan = (id: number) => planes.find((p) => p.id === id)!;
const empresa = (id: number) => {
  const e = empresas.find((x) => x.id === id);
  if (!e) throw new ErrorApi('No encontramos la empresa solicitada.', 404);
  return e;
};
const registrar = (e: (typeof empresas)[number], action: string, from: number | null) =>
  historial.push({ id: historial.length + 1, empresa: e.id, action, from, to: e.planId, at: ahora() });
empresas.forEach((e) => registrar(e, 'ASSIGN', null));

function vista(e: (typeof empresas)[number]) {
  const activas = e.id === 1 ? sucursales.filter((s) => s.activa).length : 2;
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    status: e.status,
    subscription: { id: e.id, status: e.estado, startsAt: e.startsAt, endsAt: e.endsAt, plan: plan(e.planId) },
    usage: { activeBranches: activas, branches: activas, users: e.id === 1 ? 5 : 6 },
  };
}

export const rutasSaas: RutaMock[] = [
  { metodo: 'GET', patron: /^\/tenant\/directory$/, handler: () => empresas.map(({ slug, name }) => ({ slug, name })) },
  { metodo: 'GET', patron: /^\/tenant\/public$/, handler: () => ({ id: 1, slug: 'fashionstore', name: 'FashionStore' }) },
  {
    metodo: 'GET',
    patron: /^\/tenant\/subscription$/,
    handler: (ctx) => {
      requiereSesion(ctx);
      const v = vista(empresas[0]!);
      const dias = Math.max(0, Math.ceil((Date.parse(v.subscription.endsAt) - Date.now()) / 86_400_000));
      return {
        tenant: { id: 1, slug: v.slug, name: v.name },
        plan: v.subscription.plan,
        subscription: { ...v.subscription, daysRemaining: dias },
        readOnly: v.subscription.status !== 'ACTIVE',
        usage: { ...v.usage, remainingBranches: Math.max(0, v.subscription.plan.maxActiveBranches - v.usage.activeBranches) },
      };
    },
  },
  {
    metodo: 'POST',
    patron: /^\/platform\/auth\/login$/,
    handler: ({ body }) => {
      if (body?.email !== 'plataforma@fashionstore.bo' || body?.password !== 'plataforma123')
        throw new ErrorApi('Correo o contrasena incorrectos.', 401);
      return {
        accessToken: 'mock-plataforma',
        tokenType: 'Bearer',
        user: { id: 99, name: 'Administrador de plataforma', roles: [{ role: { id: 6, name: 'PLATFORM_ADMIN', description: null } }] },
        tenant: null,
      };
    },
  },
  { metodo: 'GET', patron: /^\/platform\/plans$/, handler: () => planes },
  {
    metodo: 'PATCH',
    patron: /^\/platform\/plans\/(\d+)$/,
    handler: ({ partes, body }) => {
      const p = planes.find((x) => x.id === Number(partes[0]));
      if (!p) throw new ErrorApi('No encontramos el plan solicitado.', 404);
      Object.assign(p, {
        ...(body?.name ? { name: body.name } : {}),
        ...(body?.maxActiveBranches ? { maxActiveBranches: body.maxActiveBranches } : {}),
        ...(body?.features ? { features: body.features } : {}),
      });
      return p;
    },
  },
  { metodo: 'GET', patron: /^\/platform\/tenants$/, handler: () => empresas.map(vista) },
  {
    metodo: 'POST',
    patron: /^\/platform\/tenants$/,
    handler: ({ body }) => {
      if (empresas.some((e) => e.slug === body?.slug)) throw new ErrorApi('El codigo de empresa ya existe', 409);
      const p = planes.find((x) => x.code === body?.planCode) ?? invalido('El plan no existe o esta inactivo');
      const e = { id: empresas.length + 1, name: body.name, slug: body.slug, status: 'ACTIVE', planId: p.id, estado: 'ACTIVE' as EstadoMock, startsAt: ahora(), endsAt: enMeses(body.months ?? 12) };
      empresas.push(e);
      registrar(e, 'ASSIGN', null);
      return vista(e);
    },
  },
  {
    metodo: 'PATCH',
    patron: /^\/platform\/tenants\/(\d+)\/subscription\/plan$/,
    handler: ({ partes, body }) => {
      const e = empresa(Number(partes[0]));
      const nuevo = planes.find((x) => x.code === body?.planCode) ?? invalido('El plan no existe o esta inactivo');
      if (vista(e).usage.activeBranches > nuevo.maxActiveBranches)
        throw new ErrorApi('El uso actual de la empresa no cabe en el plan elegido.', 409, undefined, undefined, 'PLAN_LIMIT_EXCEEDED');
      const anterior = e.planId;
      e.planId = nuevo.id;
      registrar(e, 'CHANGE_PLAN', anterior);
      return vista(e);
    },
  },
  {
    metodo: 'POST',
    patron: /^\/platform\/tenants\/(\d+)\/subscription\/(renew|suspend|reactivate)$/,
    handler: ({ partes, body }) => {
      const e = empresa(Number(partes[0]));
      if (partes[1] === 'renew') {
        e.endsAt = enMeses(Number(body?.months ?? 12), new Date(Math.max(Date.now(), Date.parse(e.endsAt))));
        e.estado = 'ACTIVE';
      } else e.estado = partes[1] === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
      registrar(e, partes[1]!.toUpperCase(), e.planId);
      return vista(e);
    },
  },
  {
    metodo: 'GET',
    patron: /^\/platform\/tenants\/(\d+)\/subscription\/history$/,
    handler: ({ partes }) => {
      const e = empresa(Number(partes[0]));
      return historial
        .filter((h) => h.empresa === e.id)
        .reverse()
        .map((h) => ({
          id: h.id,
          action: h.action,
          fromPlan: h.from ? { code: plan(h.from).code, name: plan(h.from).name } : null,
          toPlan: { code: plan(h.to).code, name: plan(h.to).name },
          status: e.estado,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          createdAt: h.at,
        }));
    },
  },
];
