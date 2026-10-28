/** Modelo de la UI para empresas, planes y suscripciones (parcial 2). */

export type EstadoSuscripcion = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'NONE';

export interface Funcionalidades {
  products?: boolean;
  sales?: boolean;
  reservations?: boolean;
  offline?: boolean;
  conventionalReports?: boolean;
  aiReports?: boolean;
  mlAnalytics?: boolean;
  [clave: string]: boolean | undefined;
}

export interface EmpresaResumen {
  id?: number;
  slug: string;
  nombre: string;
}

export interface Plan {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  max_sucursales_activas: number;
  funcionalidades: Funcionalidades;
  precio_mensual?: number;
  activo?: boolean;
}

export interface Suscripcion {
  id: number;
  estado: EstadoSuscripcion;
  inicio: string;
  vencimiento: string;
  dias_restantes?: number;
}

/** GET /tenant/subscription */
export interface PlanEmpresa {
  empresa: EmpresaResumen | null;
  plan: Plan | null;
  suscripcion: Suscripcion | null;
  solo_lectura: boolean;
  uso: {
    sucursales_activas: number;
    sucursales: number;
    usuarios: number;
    sucursales_disponibles: number;
  };
}

export interface EmpresaPlataforma {
  id: number;
  nombre: string;
  slug: string;
  estado: 'ACTIVE' | 'INACTIVE';
  suscripcion: (Suscripcion & { plan: Plan }) | null;
  uso: { sucursales_activas: number; sucursales: number; usuarios: number };
}

export interface MovimientoSuscripcion {
  id: number;
  accion: string;
  plan_anterior?: string | null;
  plan_nuevo: string;
  estado: EstadoSuscripcion;
  inicio: string;
  vencimiento: string;
  observacion?: string | null;
  fecha: string;
}

export const ETIQUETA_ESTADO: Record<EstadoSuscripcion, string> = {
  ACTIVE: 'Vigente',
  EXPIRED: 'Vencida',
  SUSPENDED: 'Suspendida',
  CANCELLED: 'Cancelada',
  NONE: 'Sin suscripcion',
};

/** Nombres de las funcionalidades del plan para la UI. */
export const NOMBRE_FUNCION: Record<string, string> = {
  products: 'Gestion de productos',
  sales: 'Gestion de ventas',
  reservations: 'Reservas',
  offline: 'Operacion offline',
  conventionalReports: 'Reportes convencionales',
  aiReports: 'Reportes generativos con IA',
  mlAnalytics: 'Analitica con Machine Learning',
};
