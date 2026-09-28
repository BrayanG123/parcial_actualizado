import { api } from '../api/http';
import { endpoints } from '../api/endpoints';
import { adaptarVenta, type VentaBackend } from '../api/ventas.contratos';

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
export const posService = {
  clientes: (branchId: number, search: string) =>
    api.get<ClientePOS[]>(endpoints.ventas.clientes, { branchId, search }),
  reserva: (id: number, branchId: number) =>
    api.get<ReservaPOS>(endpoints.ventas.reserva(id), { branchId }),
  revisar: (seleccion: SeleccionPOS) =>
    api.post<CotizacionPOS>(endpoints.ventas.previsualizar, seleccion),
  cobrar: async (datos: CobroPOS) =>
    adaptarVenta(await api.post<VentaBackend>(endpoints.ventas.crear, datos)),
};
