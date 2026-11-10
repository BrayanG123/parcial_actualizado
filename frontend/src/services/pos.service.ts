import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarVenta, type VentaBackend } from '../api/ventas.contratos';
import { adaptarPagina, type PaginaBackend } from '../api/contratos';

export interface ItemPOS {
  productId: number;
  sizeId: number;
  colorId: number;
  quantity: number;
}
export interface SeleccionPOS {
  branchId: number;
  clientId?: number;
  reservationId?: number;
  items: ItemPOS[];
}
export interface ClientePOS {
  id: number;
  name: string;
  email: string;
  wholesale: boolean;
}
export interface ReservaPOS {
  id: number;
  branchId: number;
  client: ClientePOS;
  items: Array<ItemPOS & { productName: string; sizeName: string; colorName: string }>;
}
export interface CotizacionPOS {
  branchId: number;
  clientId: number | null;
  reservationId: number | null;
  wholesale: boolean;
  currency: string;
  total: number;
  items: Array<
    ItemPOS & {
      unitPrice: number;
      discount: number;
      netUnitPrice: number;
      subtotal: number;
      productName: string;
      sizeName: string;
      colorName: string;
    }
  >;
}
export type MetodoPOS = 'CASH' | 'CARD' | 'QR' | 'BANK_TRANSFER';
export interface CobroPOS extends SeleccionPOS {
  shiftId: number;
  idempotencyKey: string;
  expectedTotal: number;
  paymentMethod: MetodoPOS;
  paymentReference?: string;
}
/** Cobro con tarjeta en caja: Stripe autoriza el total y el backend registra y captura. */
export interface IntentoTarjetaPOS {
  paymentIntentId: string;
  clientSecret: string;
  publishableKey: string;
  amount: number;
  currency: string;
}
export type TicketTarjetaPOS = Omit<CobroPOS, 'paymentMethod' | 'paymentReference'>;
export const posService = {
  intentoTarjeta: (datos: TicketTarjetaPOS) =>
    api.post<IntentoTarjetaPOS>('/payments/pos/card-intents', datos),
  cobrarTarjeta: async (datos: TicketTarjetaPOS & { paymentIntentId: string }) =>
    adaptarVenta(await api.post<VentaBackend>('/payments/pos/card-charges', datos)),
  /** Ventas registradas por el cajero; con turno, solo las de esa caja abierta. */
  historial: async (page: number, shiftId?: number) =>
    adaptarPagina(
      await api.get<PaginaBackend<VentaBackend>>(endpoints.ventas.lista, {
        page,
        limit: 10,
        mine: true,
        shiftId,
      }),
      adaptarVenta,
    ),
  clientes: (branchId: number, search: string) =>
    api.get<ClientePOS[]>(endpoints.ventas.clientes, { branchId, search }),
  reserva: (id: number, branchId: number) =>
    api.get<ReservaPOS>(endpoints.ventas.reserva(id), { branchId }),
  revisar: (seleccion: SeleccionPOS) =>
    api.post<CotizacionPOS>(endpoints.ventas.previsualizar, seleccion),
  cobrar: async (datos: CobroPOS) =>
    adaptarVenta(await api.post<VentaBackend>(endpoints.ventas.crear, datos)),
};
