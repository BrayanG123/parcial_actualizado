import { api } from '../api/http';
import { adaptarVenta, type VentaBackend } from '../api/ventas.contratos';
import type { ItemPOS } from './pos.service';
export interface VarianteOffline {
  productId: number;
  sizeId: number;
  colorId: number;
  available: number;
  productName: string;
  sizeName: string;
  colorName: string;
  unitPrice: number;
  discount: number;
  netUnitPrice: number;
}
export interface LoteOffline {
  id: string;
  shiftId: number;
  deviceId: string;
  preparedAt: string;
  finishedAt: string | null;
  snapshot: {
    branchId: number;
    branchName: string;
    registerName: string;
    userId: number;
    currency: string;
    expiresAt: string;
    variants: VarianteOffline[];
  };
}
export interface DatosTicketOffline {
  deviceId: string;
  idempotencyKey: string;
  recordedAt: string;
  expectedTotal: number;
  items: ItemPOS[];
}
export const offlineService = {
  preparar: (datos: { id: string; deviceId: string; shiftId: number }) =>
    api.post<LoteOffline>('/sales/offline/prepare', datos),
  sincronizar: async (id: string, datos: DatosTicketOffline) =>
    adaptarVenta(await api.post<VentaBackend>(`/sales/offline/${id}/sales`, datos)),
  finalizar: (id: string, datos: { deviceId: string; keys: string[] }) =>
    api.post<{ finishedAt: string }>(`/sales/offline/${id}/finish`, datos),
};
