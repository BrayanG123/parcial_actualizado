/** Landing SaaS publica: planes disponibles y alta autoservicio de una empresa. */
import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import type { CobroSuscripcion } from './suscripcion.service';

export interface PlanPublico {
  codigo: string;
  nombre: string;
  descripcion: string;
  max_sucursales: number;
  funcionalidades: Record<string, boolean>;
  precio_mensual: number;
}

interface PlanPublicoBackend {
  code: string;
  name: string;
  description: string | null;
  maxActiveBranches: number;
  features: Record<string, unknown> | null;
  monthlyPrice: string | number;
}

export interface NuevaEmpresaPublica {
  nombre: string;
  slug: string;
  plan: string;
  admin: { nombre: string; email: string; password: string };
}

export const saasService = {
  async planes(): Promise<PlanPublico[]> {
    const lista = await api.get<PlanPublicoBackend[]>(endpoints.saas.planes);
    return lista.map((p) => ({
      codigo: p.code,
      nombre: p.name,
      descripcion: p.description ?? '',
      max_sucursales: p.maxActiveBranches,
      funcionalidades: Object.fromEntries(
        Object.entries(p.features ?? {}).map(([clave, valor]) => [clave, valor === true]),
      ),
      precio_mensual: Number(p.monthlyPrice),
    }));
  },

  /** Plan gratuito: crea la empresa. Plan de pago: devuelve el cobro a completar con Stripe. */
  async registrarEmpresa(
    datos: NuevaEmpresaPublica,
  ): Promise<{ slug: string; nombre: string } | CobroSuscripcion> {
    const e = await api.post<{ slug: string; name: string } | CobroSuscripcion>(endpoints.saas.registro, {
      name: datos.nombre.trim(),
      slug: datos.slug.trim().toLowerCase(),
      planCode: datos.plan,
      admin: {
        name: datos.admin.nombre.trim(),
        email: datos.admin.email.trim(),
        password: datos.admin.password,
      },
    });
    if ('paymentRequired' in e && e.paymentRequired) return e;
    const creada = e as { slug: string; name: string };
    return { slug: creada.slug, nombre: creada.name };
  },
};

/** Nombre de tienda -> codigo de empresa sugerido (minusculas, numeros y guiones). */
export function sugerirCodigo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Textos de las funcionalidades de un plan, en el orden en que se muestran. */
export const FUNCIONALIDADES_PLAN: Array<[string, string]> = [
  ['products', 'Catalogo de productos y variantes'],
  ['sales', 'Ventas en tienda, online y caja'],
  ['reservations', 'Reservas de prendas'],
  ['offline', 'Operacion sin conexion (web y movil)'],
  ['conventionalReports', 'Reportes y dashboard'],
  ['aiReports', 'Reportes generativos con IA y voz'],
  ['mlAnalytics', 'Analitica con Machine Learning'],
];
