import { api } from "../api/http";
import type { PaginaBackend } from "../api/contratos";
export interface ProductoProveedor {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  supplierAvailability: string | null;
  seasonId: number;
  collectionId: number;
  category: { id: number; name: string };
  season: { id: number; name: string; active: boolean };
  collection: { id: number; name: string; active: boolean; seasonId: number };
}
export interface FichaProveedor {
  name: string;
  description: string;
  supplierAvailability: string;
  seasonId?: number;
  collectionId?: number;
}
export interface EntregaProveedor {
  id: number;
  quantity: number;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  reference: string | null;
  occurredAt: string;
  scheduledAt: string | null;
  inventory: {
    product: { id: number; name: string };
    size: { name: string };
    color: { name: string };
    branch: { name: string; city: string };
  };
}
export const proveedorService = {
  suministro: (id: number) =>
    api.get<{ supplierAvailability: string | null }>(
      `/supplier/products/${id}/supply`,
    ),
  productos: (page: number, search = "") =>
    api.get<PaginaBackend<ProductoProveedor>>("/supplier/products", {
      page,
      limit: 20,
      search: search || undefined,
    }),
  guardar: (id: number, ficha: FichaProveedor) =>
    api.patch<ProductoProveedor>(`/supplier/products/${id}`, ficha),
  entregas: (page: number) =>
    api.get<PaginaBackend<EntregaProveedor>>("/supplier/deliveries", {
      page,
      limit: 20,
    }),
};
