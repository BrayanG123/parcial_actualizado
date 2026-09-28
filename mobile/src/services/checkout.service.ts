/**
 * Compra digital desde la app (canal MOBILE).
 *   POST  /sales/checkout/preview   -> cotizacion con quoteHash
 *   POST  /sales/checkout           -> venta PENDING_PAYMENT con stock apartado
 *   POST  /payments/stripe/intents  -> clientSecret (modo prueba)
 *   GET   /sales/:id                -> estado para confirmar el pago
 *   PATCH /sales/:id/cancel         -> libera el stock si no se pago
 */
import { api, USAR_MOCKS } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarVenta, type EstadoVentaBackend, type VentaBackend } from '../api/comercio.contratos';
import { ErrorApi } from '../types/api';
import type { Venta } from '../types/domain';

export type OpcionPago = 'STRIPE' | 'CASH_ON_DELIVERY';

export interface CotizacionCheckout {
  cartId: number;
  branchId: number;
  quoteHash: string;
  currency: string;
  total: number;
}

export interface PedidoCheckout {
  cartId: number;
  branchId: number;
  quoteHash: string;
  idempotencyKey: string;
  paymentOption: OpcionPago;
  deliveryName?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
}

export interface IntentoPago {
  saleId: number;
  clientSecret: string | null;
  publishableKey?: string;
  status: string;
}

/** Venta adaptada y su estado tecnico, necesario para saber si falta pagar. */
export interface ResultadoCheckout {
  venta: Venta;
  estado: EstadoVentaBackend;
}

function requiereApi() {
  if (USAR_MOCKS) throw new ErrorApi('La compra requiere conectar la app al backend (EXPO_PUBLIC_USE_MOCKS=false).', 400);
}

const resultado = (v: VentaBackend): ResultadoCheckout => ({ venta: adaptarVenta(v), estado: v.status });

export const checkoutService = {
  cotizar(cartId: number, branchId: number) {
    requiereApi();
    return api.post<CotizacionCheckout>(endpoints.ventas.cotizar, { cartId, branchId });
  },
  async confirmar(pedido: PedidoCheckout) {
    requiereApi();
    return resultado(await api.post<VentaBackend>(endpoints.ventas.checkout, { ...pedido, channel: 'MOBILE' }));
  },
  async consultar(id: number) {
    requiereApi();
    return resultado(await api.get<VentaBackend>(endpoints.ventas.detalle(id)));
  },
  intentoStripe(saleId: number) {
    requiereApi();
    return api.post<IntentoPago>(endpoints.pagos.intento, { saleId });
  },
  cancelar(id: number) {
    requiereApi();
    return api.patch<VentaBackend>(endpoints.ventas.cancelar(id));
  },
};

/** Clave de idempotencia v4: reintentar la misma confirmacion no duplica el pedido. */
export function nuevaClaveIdempotencia(): string {
  const nativa = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (nativa) return nativa.call((globalThis as { crypto: object }).crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
