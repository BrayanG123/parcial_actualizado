import { api } from "../api/http";
import type { VentaBackend } from "../api/ventas.contratos";
import type { CotizacionPOS } from "./pos.service";

export interface CotizacionCheckout {
  cartId: number;
  branchId: number;
  quoteHash: string;
  currency: string;
  total: number;
  items: CotizacionPOS["items"];
}
export interface PedidoCheckout {
  cartId: number;
  branchId: number;
  quoteHash: string;
  channel: "WEB";
  idempotencyKey: string;
  paymentOption: "STRIPE" | "CASH_ON_DELIVERY";
  deliveryName?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
}
export interface IntentoStripe {
  saleId: number;
  clientSecret: string | null;
  publishableKey?: string;
  stripeStatus?: string;
  status: string;
  expiresAt?: string;
}
export const checkoutService = {
  revisar: (cartId: number, branchId: number) =>
    api.post<CotizacionCheckout>("/sales/checkout/preview", {
      cartId,
      branchId,
    }),
  crear: (datos: PedidoCheckout) =>
    api.post<VentaBackend>("/sales/checkout", datos),
  obtener: (id: number) => api.get<VentaBackend>(`/sales/${id}`),
  cancelar: (id: number) => api.patch<VentaBackend>(`/sales/${id}/cancel`),
  entregar: (id: number, shiftId: number, expectedTotal: number) =>
    api.post<VentaBackend>(`/sales/${id}/deliver`, { shiftId, expectedTotal }),
  configuracion: () =>
    api.get<{ publishableKey: string; mode: "test" }>(
      "/payments/stripe/config",
    ),
  intento: (saleId: number) =>
    api.post<IntentoStripe>("/payments/stripe/intents", { saleId }),
};
