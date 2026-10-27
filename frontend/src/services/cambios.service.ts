/** Cambios de prendas y notas de credito (F7.2 / F7.3). */
import { api } from '../api/http';

export interface OpcionesCambio {
  sale: { id: number; status: string; soldAt: string; total: string; branchId: number | null };
  windowDays: number;
  deadline: string;
  withinWindow: boolean;
  branchId: number | null;
  items: Array<{
    id: number;
    productId: number;
    sizeId: number;
    colorId: number;
    productName: string | null;
    sizeName: string | null;
    colorName: string | null;
    quantity: number;
    exchangeable: number;
    paidUnitPrice: string;
  }>;
  candidates: Array<{
    productId: number;
    sizeId: number;
    colorId: number;
    productName: string;
    sizeName: string;
    colorName: string;
    unitPrice: string;
    available: number;
  }>;
  exchanges: CambioRegistrado[];
}

export interface CambioRegistrado {
  id: number;
  quantity: number;
  difference: string;
  settlement: 'EVEN' | 'CHARGED' | 'CREDIT_NOTE';
  newProductName: string;
  exchangedAt: string;
  creditNote: { code: string; amount: string; balance: string; status: string } | null;
}

export interface DatosCambio {
  saleId: number;
  saleItemId: number;
  quantity: number;
  newProductId: number;
  newSizeId: number;
  newColorId: number;
  shiftId?: number;
  reason?: string;
  expectedDifference?: number;
}

export const cambiosService = {
  opciones: (ventaId: number) => api.get<OpcionesCambio>(`/exchanges/sales/${ventaId}`),
  crear: (datos: DatosCambio) => api.post<CambioRegistrado>('/exchanges', datos),
  notaCredito: (codigo: string) =>
    api.get<{ code: string; amount: string; balance: string; status: string }>(`/credit-notes/${encodeURIComponent(codigo.trim())}`),
  canjear: (codigo: string, monto: number) =>
    api.post<{ code: string; balance: string; status: string }>(`/credit-notes/${encodeURIComponent(codigo.trim())}/redeem`, {
      amount: monto,
    }),
};
