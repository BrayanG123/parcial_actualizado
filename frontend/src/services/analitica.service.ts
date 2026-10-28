/** Analitica con Machine Learning (F9): NestJS consulta el servicio interno de ML. */
import { api } from '../api/http';

export interface PuntoPrediccion {
  week: string;
  units: number;
  low: number;
  high: number;
}
export interface EstadoParte {
  status: 'TRAINED' | 'INSUFFICIENT_DATA';
  message?: string;
  metrics?: Record<string, unknown>;
}
export interface MetricasDemanda {
  rows: number;
  series: number;
  weeks: number;
  crossValidation: {
    method: string;
    mean: { mae: number; rmse: number; r2: number };
    std: { mae: number; rmse: number; r2: number };
    folds: Array<{ fold: number; trainRows: number; testRows: number; mae: number; rmse: number; r2: number }>;
  };
  holdout: { weeks: number; mae: number; rmse: number; r2: number };
  baselines: Record<'lastWeek' | 'mean4Weeks', { mae: number; rmse: number; r2: number }>;
  beatsBaselines: boolean;
  improvementVsLastWeek: number | null;
  featureImportance: Array<{ feature: string; importance: number }>;
}
export interface MetricasSegmentacion {
  customers: number;
  chosenK: number;
  selectionRule: string;
  silhouette: number;
  daviesBouldin: number;
  calinskiHarabasz: number;
  adjustedRandVsProfiles?: number;
  candidates: Array<{ k: number; silhouette: number; daviesBouldin: number; calinskiHarabasz: number }>;
}
export interface MetricasAnomalias {
  weeks: number;
  flagged: number;
  minDeviation?: number;
  injected?: number;
  precision?: number;
  recall?: number;
  f1?: number;
}
export interface Segmento {
  segment: string;
  customers: number;
  share: number;
  avgRecencyDays: number;
  avgFrequency: number;
  avgMonetary: number;
  totalMonetary: number;
  action: string;
}
export interface SemanaAnomala {
  branchId: number;
  branchName: string;
  week: string;
  units: number;
  expected: number;
  kind: 'spike' | 'drop';
  score: number;
}

export type DashboardML =
  | { trained: false }
  | {
      trained: true;
      model: {
        source: 'synthetic' | 'provided';
        trainedAt: string;
        asOf: string;
        salesRows: number;
        transactions: number;
        parts: Record<'demand' | 'segmentation' | 'anomalies', EstadoParte>;
      };
      scope: string[] | null;
      forecast: {
        horizon: number;
        lastObservedWeek: string;
        series: number;
        totals: PuntoPrediccion[];
        top: Array<{
          productId: number;
          branchId: number;
          productName: string;
          categoryName: string | null;
          branchName: string;
          units: number;
          weeks: PuntoPrediccion[];
        }>;
        interval: string;
      } | null;
      segments: { summary: Segmento[]; metrics: MetricasSegmentacion } | null;
      anomalies: {
        metrics: MetricasAnomalias;
        flagged: SemanaAnomala[];
        series: Array<{
          branchId: number;
          branchName: string;
          week: string;
          units: number;
          expected: number;
          anomaly: boolean;
        }>;
      } | null;
    };

export const analiticaService = {
  dashboard: (horizonte: number) => api.get<DashboardML>('/ml/dashboard', { horizon: horizonte }),
  entrenar: (origen: 'synthetic' | 'real') =>
    api.postLargo<{ parts: Record<string, EstadoParte> }>('/ml/train', { source: origen }),
};
