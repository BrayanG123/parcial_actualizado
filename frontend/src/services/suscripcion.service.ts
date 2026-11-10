/** Cobro de suscripciones SaaS con Stripe: alta, empresa nueva, cambio de plan y renovacion. */
import { api } from '../api/http';

/** Respuesta cuando hay que pagar antes de aplicar el cambio. */
export interface CobroSuscripcion {
  paymentRequired: true;
  paymentId: string;
  clientSecret: string;
  publishableKey: string;
  amount: number;
  currency: string;
  months: number;
  plan: { code: string; name: string };
  kind: TipoPagoSuscripcion;
}
export type TipoPagoSuscripcion = 'SIGNUP' | 'NEW_TENANT' | 'CHANGE_PLAN' | 'RENEW';
export type EstadoPago = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export interface PagoSuscripcion {
  paymentId: string;
  kind: TipoPagoSuscripcion;
  kindLabel: string;
  status: EstadoPago;
  amount: number;
  currency: string;
  months: number;
  plan: { code: string; name: string } | null;
  tenant: { id: number; slug: string; name: string } | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}
/** Cambio aplicado sin cobro (plan gratuito). */
export interface SinCobro {
  paymentRequired: false;
}
export type ResultadoPlan = CobroSuscripcion | SinCobro;

export const ETIQUETA_PAGO: Record<EstadoPago, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagado',
  FAILED: 'Fallido',
  REFUNDED: 'Reembolsado',
};

export const suscripcionService = {
  /** Consulta el pago en Stripe y aplica su efecto si ya se cobro (idempotente). */
  confirmar: (paymentId: string) =>
    api.post<PagoSuscripcion>(`/saas/payments/${paymentId}/confirm`, {}),
  cambiarPlan: (planCode: string) =>
    api.post<ResultadoPlan>('/billing/subscription/change', { planCode }),
  renovar: (months: number) => api.post<ResultadoPlan>('/billing/subscription/renew', { months }),
  pagos: () => api.get<PagoSuscripcion[]>('/billing/payments'),
};

export function precioUsd(valor: number, moneda = 'USD') {
  return `${moneda === 'USD' ? '$' : `${moneda} `}${valor.toFixed(2)}`;
}
