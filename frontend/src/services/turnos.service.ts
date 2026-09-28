import { api } from '../api/http';
import type { PaginaBackend } from '../api/contratos';
export interface CajaFisica {
  id: number;
  branchId: number;
  name: string;
  occupied: boolean;
  cashier: string | null;
}
export interface Turno {
  offlineActive?: boolean;
  id: number;
  registerId: number;
  branchId: number;
  registerName: string;
  branchName: string;
  userId: number;
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  currency: string;
  openingCash: number;
  cashTotal: number;
  cardTotal: number;
  qrTotal: number;
  transferTotal: number;
  totalSales: number;
  saleCount: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  closingNote: string | null;
}
export interface Apertura {
  registerId: number;
  openingCash: number;
  openingKey: string;
}
export interface Cierre {
  countedCash: number;
  note?: string;
}
export const turnosService = {
  actual: () => api.get<Turno | null>('/cash/shifts/current'),
  cajas: (branchId: number) => api.get<CajaFisica[]>('/cash/registers', { branchId }),
  crearCaja: (branchId: number, name: string) =>
    api.post<CajaFisica>('/cash/registers', { branchId, name }),
  abrir: (datos: Apertura) => api.post<Turno>('/cash/shifts', datos),
  cerrar: (id: number, datos: Cierre) => api.post<Turno>(`/cash/shifts/${id}/close`, datos),
  historial: (page: number, branchId?: number) =>
    api.get<PaginaBackend<Turno>>('/cash/shifts', { page, limit: 15, branchId }),
};
