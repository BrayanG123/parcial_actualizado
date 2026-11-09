/** Transporte del contrato de sincronizacion (backend/src/modules/sync). */
import { api } from '../api/http';
import type { SnapshotOffline } from './tipos';

export interface OperacionEnvio {
  operationId: string;
  type: string;
  branchId: number;
  createdAtLocal: string;
  /** El servidor verifica que coincidan con el token (TENANT_MISMATCH / USER_MISMATCH). */
  tenantId?: number;
  userId?: number;
  payload: Record<string, unknown>;
  payloadHash: string;
}

export interface ResultadoServidor {
  operationId: string;
  status: 'CONFIRMED' | 'REJECTED' | 'CONFLICT' | 'PROCESSING' | 'ERROR';
  code?: string | null;
  message?: string | null;
  detail?: unknown;
  resourceType?: string | null;
  resourceId?: number | null;
  attempts: number;
  processedAt?: string | null;
}

type SnapshotBackend = Omit<SnapshotOffline, 'clave' | 'alcance' | 'branchId' | 'descargadoEn'>;

export const syncApi = {
  snapshot: (branchId?: number, deviceId?: string) =>
    api.get<SnapshotBackend>('/sync/snapshot', {
      ...(branchId ? { branchId } : {}),
      ...(deviceId ? { deviceId } : {}),
    }),
  /** Aparta stock para esta caja (cupo offline) y devuelve la descarga con el cupo. */
  apartarCupo: (deviceId: string, perVariant?: number, branchId?: number) =>
    api.post<SnapshotBackend>('/sync/quota', {
      deviceId,
      ...(perVariant ? { perVariant } : {}),
      ...(branchId ? { branchId } : {}),
    }),
  liberarCupo: (id: number, deviceId: string) =>
    api.post<SnapshotBackend>(`/sync/quota/${id}/release`, { deviceId }),
  enviar: (deviceId: string, operations: OperacionEnvio[]) =>
    api.post<{ deviceId: string; serverTime: string; results: ResultadoServidor[] }>('/sync/operations', {
      deviceId,
      operations,
    }),
};
