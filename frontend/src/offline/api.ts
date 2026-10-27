/** Transporte del contrato de sincronizacion (backend/src/modules/sync). */
import { api } from '../api/http';
import type { SnapshotOffline } from './tipos';

export interface OperacionEnvio {
  operationId: string;
  type: string;
  branchId: number;
  createdAtLocal: string;
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
  snapshot: (branchId?: number) =>
    api.get<SnapshotBackend>('/sync/snapshot', branchId ? { branchId } : undefined),
  enviar: (deviceId: string, operations: OperacionEnvio[]) =>
    api.post<{ deviceId: string; serverTime: string; results: ResultadoServidor[] }>('/sync/operations', {
      deviceId,
      operations,
    }),
};
