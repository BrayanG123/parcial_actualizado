import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { todayBolivia } from '../ai/report-intent.js';
import { MlDashboardQueryDto, TrainMlDto } from './dto/ml.dto.js';
import { ML_CLIENT, type MlClient } from './ml.client.js';
import { MlRepository } from './ml.repository.js';

/** Semilla fija: el mismo catalogo produce el mismo entrenamiento sintetico. */
const SEED = 42;
const TOP_SERIES = 10;

export interface PartStatus {
  status: 'TRAINED' | 'INSUFFICIENT_DATA';
  message?: string;
  metrics?: Record<string, unknown>;
}
export interface MetricsResponse {
  source: string;
  trainedAt: string;
  asOf: string;
  salesRows: number;
  transactions: number;
  parts: Record<'demand' | 'segmentation' | 'anomalies', PartStatus>;
}
export interface ForecastResponse {
  horizon: number;
  lastObservedWeek: string;
  series: number;
  totals: Array<{ week: string; units: number; low: number; high: number }>;
  top: Array<{
    productId: number;
    branchId: number;
    units: number;
    weeks: Array<{ week: string; units: number; low: number; high: number }>;
  }>;
  interval: string;
}
export interface AnomaliesResponse {
  metrics: Record<string, unknown>;
  flagged: Array<{
    branchId: number;
    week: string;
    units: number;
    expected: number;
    kind: string;
    score: number;
  }>;
  series: Array<{
    branchId: number;
    week: string;
    units: number;
    expected: number;
    anomaly: boolean;
  }>;
}

/**
 * Analitica con ML. La empresa siempre sale del contexto autenticado (nunca del cliente) y
 * forma parte de la ruta del servicio, que guarda un modelo por empresa.
 */
@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  private readonly training = new Set<number>();

  constructor(
    @Inject(ML_CLIENT) private readonly client: MlClient,
    private readonly repository: MlRepository,
  ) {}

  private base() {
    return `/v1/tenants/${tenantContext.requireTenantId()}`;
  }

  async train(dto: TrainMlDto, user: AuthenticatedUser) {
    const tenantId = tenantContext.requireTenantId();
    if (this.training.has(tenantId))
      throw new ConflictException({
        code: 'ML_TRAINING_IN_PROGRESS',
        message: 'Ya hay un entrenamiento en curso para la empresa.',
      });
    this.training.add(tenantId);
    try {
      const body =
        dto.source === 'synthetic'
          ? await this.syntheticPayload()
          : await this.realPayload();
      const result = await this.client.request<MetricsResponse>(
        'POST',
        `${this.base()}/train`,
        body,
      );
      // Auditoria minima: sin datos de negocio.
      this.logger.log(
        `ML entrenado: empresa ${tenantId}, usuario ${user.id}, fuente ${dto.source}`,
      );
      return result;
    } finally {
      this.training.delete(tenantId);
    }
  }

  private async syntheticPayload() {
    const catalog = await this.repository.catalogShape();
    if (!catalog.branches.length || !catalog.products.length)
      throw new UnprocessableEntityException({
        code: 'ML_INSUFFICIENT_DATA',
        message: 'Se necesita al menos una sucursal y un producto activos.',
      });
    return {
      source: 'synthetic',
      seed: SEED,
      weeks: 104,
      customers: 400,
      catalog,
      asOf: todayBolivia(),
    };
  }

  private async realPayload() {
    const [sales, transactions] = await Promise.all([
      this.repository.weeklySales(),
      this.repository.transactions(),
    ]);
    if (!sales.length && !transactions.length)
      throw new UnprocessableEntityException({
        code: 'ML_INSUFFICIENT_DATA',
        message: 'La empresa no tiene ventas completadas para entrenar.',
      });
    return {
      source: 'provided',
      sales,
      transactions,
      asOf: todayBolivia(),
    };
  }

  /** Sucursales visibles: el encargado solo la suya. */
  private async scope(user: AuthenticatedUser, branchId?: number) {
    if (user.roles.includes(Role.ADMINISTRATOR))
      return branchId ? [branchId] : undefined;
    const employee = await this.repository.employee(user.id);
    if (!employee?.active)
      throw new ForbiddenException('An active employee profile is required');
    if (branchId && branchId !== employee.branchId)
      throw new ForbiddenException(
        'Analytics are limited to your assigned branch',
      );
    return [employee.branchId];
  }

  async dashboard(query: MlDashboardQueryDto, user: AuthenticatedUser) {
    const branchIds = await this.scope(user, query.branchId);
    let metrics: MetricsResponse;
    try {
      metrics = await this.client.request<MetricsResponse>(
        'GET',
        `${this.base()}/metrics`,
      );
    } catch (error) {
      if (
        error instanceof ConflictException &&
        (error.getResponse() as { code?: string }).code ===
          'ML_MODEL_NOT_TRAINED'
      )
        return { trained: false as const };
      throw error;
    }
    const trained = (part: keyof MetricsResponse['parts']) =>
      metrics.parts[part]?.status === 'TRAINED';
    const [forecast, segments, anomalies] = await Promise.all([
      trained('demand')
        ? this.client.request<ForecastResponse>(
            'POST',
            `${this.base()}/forecast`,
            {
              horizon: query.horizon,
              branchIds,
              top: TOP_SERIES,
            },
          )
        : null,
      trained('segmentation')
        ? this.client.request<{ summary: unknown[]; metrics: unknown }>(
            'GET',
            `${this.base()}/segments`,
          )
        : null,
      trained('anomalies')
        ? this.client.request<AnomaliesResponse>(
            'GET',
            `${this.base()}/anomalies`,
          )
        : null,
    ]);

    const inScope = (id: number) => !branchIds || branchIds.includes(id);
    const productIds = forecast?.top.map((s) => s.productId) ?? [];
    const allBranchIds = [
      ...(forecast?.top.map((s) => s.branchId) ?? []),
      ...(anomalies?.flagged.map((a) => a.branchId) ?? []),
      ...(anomalies?.series.map((a) => a.branchId) ?? []),
    ];
    const names = await this.repository.names(
      [...new Set(productIds)],
      [...new Set(allBranchIds)],
    );
    const branchName = (id: number) =>
      names.branches.get(id) ?? `Sucursal #${id}`;
    return {
      trained: true as const,
      model: {
        source: metrics.source,
        trainedAt: metrics.trainedAt,
        asOf: metrics.asOf,
        salesRows: metrics.salesRows,
        transactions: metrics.transactions,
        parts: metrics.parts,
      },
      scope: branchIds ? branchIds.map(branchName) : null,
      forecast: forecast && {
        ...forecast,
        top: forecast.top.map((s) => ({
          ...s,
          productName:
            names.products.get(s.productId)?.name ?? `Producto #${s.productId}`,
          categoryName: names.products.get(s.productId)?.category?.name ?? null,
          branchName: branchName(s.branchId),
        })),
      },
      segments,
      anomalies: anomalies && {
        metrics: anomalies.metrics,
        flagged: anomalies.flagged
          .filter((a) => inScope(a.branchId))
          .map((a) => ({ ...a, branchName: branchName(a.branchId) })),
        series: anomalies.series
          .filter((a) => inScope(a.branchId))
          .map((a) => ({ ...a, branchName: branchName(a.branchId) })),
      },
    };
  }
}
