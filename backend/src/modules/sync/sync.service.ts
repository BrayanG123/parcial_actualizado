import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma, SyncOperation } from '../../generated/prisma/client.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { ExchangesService } from '../exchanges/exchanges.service.js';
import { SubscriptionAccessService } from '../tenancy/subscription-access.service.js';
import {
  ExchangePayloadDto,
  ReservationPayloadDto,
  SaleCashPayloadDto,
  SyncBatchDto,
  SyncLogsQueryDto,
  SyncOperationDto,
} from './dto/sync.dto.js';
import { SyncSalesService } from './sync-sales.service.js';
import {
  classify,
  conflict,
  rejected,
  type ClassifiedOutcome,
} from './sync-outcome.js';

/** Respuesta por operacion (los clientes guardan este resultado localmente). */
export interface SyncResult {
  operationId: string;
  /** ERROR: fallo transitorio del servidor; el cliente debe reintentar (RETRY). */
  status: 'CONFIRMED' | 'REJECTED' | 'CONFLICT' | 'PROCESSING' | 'ERROR';
  code?: string | null;
  message?: string | null;
  detail?: unknown;
  resourceType?: string | null;
  resourceId?: number | null;
  attempts: number;
  processedAt?: Date | null;
}

const FINAL = new Set(['CONFIRMED', 'REJECTED']);

/** JSON con claves ordenadas: el mismo payload produce el mismo hash en cualquier cliente. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}
export const payloadHash = (payload: unknown) =>
  createHash('sha256').update(canonical(payload)).digest('hex');

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SyncSalesService,
    private readonly reservations: ReservationsService,
    private readonly access: SubscriptionAccessService,
    private readonly exchanges: ExchangesService,
  ) {}

  /** POST /sync/operations: procesa el lote en orden; cada operacion es independiente. */
  async process(batch: SyncBatchDto, user: AuthenticatedUser) {
    const tenantId = tenantContext.requireTenantId();
    const subscription = await this.access.forTenant(tenantId);
    const results: SyncResult[] = [];
    for (const operation of batch.operations)
      results.push(
        await this.processOne(
          operation,
          batch.deviceId,
          user,
          tenantId,
          subscription.readOnly,
        ),
      );
    return { deviceId: batch.deviceId, serverTime: new Date(), results };
  }

  private async processOne(
    dto: SyncOperationDto,
    deviceId: string,
    user: AuthenticatedUser,
    tenantId: number,
    readOnly: boolean,
  ): Promise<SyncResult> {
    const started = Date.now();
    const hash = payloadHash(dto.payload);
    const base = {
      operationId: dto.operationId,
      deviceId,
      userId: user.id,
      branchId: dto.branchId,
      type: dto.type,
      payload: dto.payload as Prisma.InputJsonValue,
      payloadHash: hash,
      createdAtLocal: new Date(dto.createdAtLocal),
    };
    let record = await this.prisma.syncOperation.findUnique({
      where: {
        tenantId_operationId: { tenantId, operationId: dto.operationId },
      },
    });
    if (record && (record.payloadHash !== hash || record.userId !== user.id))
      // No se toca la operacion original: otro contenido con el mismo identificador.
      return {
        operationId: dto.operationId,
        status: 'REJECTED',
        code: 'OPERATION_ID_REUSED',
        message: 'El identificador ya se uso para otra operacion',
        attempts: record.attempts,
      };
    if (record && FINAL.has(record.status)) return this.view(record);
    if (!record) {
      try {
        record = await this.prisma.syncOperation.create({
          data: { ...base, status: 'PROCESSING' },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        // Otra peticion la registro al mismo tiempo: se devuelve su estado actual.
        const current = await this.prisma.syncOperation.findUniqueOrThrow({
          where: {
            tenantId_operationId: { tenantId, operationId: dto.operationId },
          },
        });
        return this.view(current);
      }
    }
    const attempt = record.attempts + 1;
    let outcome:
      | ClassifiedOutcome
      | { status: 'CONFIRMED'; resourceType: string; resourceId: number };
    try {
      if (readOnly)
        throw conflict(
          'SUBSCRIPTION_INVALID',
          'La suscripcion de la empresa no esta vigente; la operacion se conserva para reintentar',
        );
      this.assertIdentity(dto, user, tenantId);
      if (dto.payloadHash && dto.payloadHash !== hash)
        throw rejected(
          'PAYLOAD_HASH_MISMATCH',
          'Los datos recibidos no coinciden con su hash; la operacion pudo alterarse',
        );
      outcome = { status: 'CONFIRMED', ...(await this.execute(dto, user)) };
    } catch (error) {
      outcome = classify(error);
      if (outcome.status === 'ERROR')
        this.logger.error(
          `Sync ${dto.type} attempt ${attempt} failed with a server error`,
          error instanceof Error ? error.stack : undefined,
        );
    }
    const latencyMs = Date.now() - started;
    const stored = outcome.status === 'ERROR' ? 'PROCESSING' : outcome.status;
    const failure = outcome.status === 'CONFIRMED' ? undefined : outcome;
    const updated = await this.prisma.syncOperation.update({
      where: { id: record.id },
      data: {
        status: stored,
        attempts: attempt,
        processedAt: new Date(),
        resultCode: failure?.code ?? null,
        resultMessage: failure?.message.slice(0, 500) ?? null,
        resultDetail:
          (failure?.detail as Prisma.InputJsonValue) ?? Prisma.DbNull,
        resourceType:
          outcome.status === 'CONFIRMED' ? outcome.resourceType : null,
        resourceId: outcome.status === 'CONFIRMED' ? outcome.resourceId : null,
        logs: {
          create: {
            attempt,
            status: stored,
            errorCode: failure?.code ?? null,
            latencyMs,
          },
        },
      },
    });
    const view = this.view(updated);
    return outcome.status === 'ERROR' ? { ...view, status: 'ERROR' } : view;
  }

  /** Empresa y usuario declarados por el cliente deben ser los del token. */
  private assertIdentity(
    dto: SyncOperationDto,
    user: AuthenticatedUser,
    tenantId: number,
  ) {
    if (dto.tenantId !== undefined && dto.tenantId !== tenantId)
      throw rejected(
        'TENANT_MISMATCH',
        'La operacion pertenece a otra empresa',
      );
    if (dto.userId !== undefined && dto.userId !== user.id)
      throw rejected('USER_MISMATCH', 'La operacion pertenece a otro usuario');
    const createdAt = new Date(dto.createdAtLocal).getTime();
    if (createdAt > Date.now() + 10 * 60_000)
      throw rejected('INVALID_DATE', 'La fecha local esta en el futuro');
  }

  private async execute(dto: SyncOperationDto, user: AuthenticatedUser) {
    switch (dto.type) {
      case 'SALE_CASH': {
        const payload = await this.payload(SaleCashPayloadDto, dto.payload);
        const saleId = await this.sales.confirm(
          {
            operationId: dto.operationId,
            branchId: dto.branchId,
            recordedAt: new Date(dto.createdAtLocal),
            payload,
          },
          user,
        );
        return { resourceType: 'SALE', resourceId: saleId };
      }
      case 'RESERVATION': {
        const payload = await this.payload(ReservationPayloadDto, dto.payload);
        const reservation = await this.reservations.create(
          { ...payload, branchId: dto.branchId },
          user,
          { operationKey: dto.operationId },
        );
        return { resourceType: 'RESERVATION', resourceId: reservation.id };
      }
      case 'EXCHANGE': {
        const payload = await this.payload(ExchangePayloadDto, dto.payload);
        const exchange = await this.exchanges.create(
          { ...payload, branchId: dto.branchId },
          user,
          {
            operationKey: dto.operationId,
            exchangedAt: new Date(dto.createdAtLocal),
          },
        );
        return { resourceType: 'EXCHANGE', resourceId: exchange.id };
      }
      default:
        throw rejected('UNSUPPORTED_TYPE', `Tipo ${dto.type} aun no soportado`);
    }
  }

  private async payload<T extends object>(
    type: new () => T,
    raw: unknown,
  ): Promise<T> {
    const value = plainToInstance(type, raw);
    const errors = await validate(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length)
      throw rejected(
        'INVALID_DATA',
        'Los datos de la operacion no son validos',
        errors.map((e) => ({
          field: e.property,
          rules: Object.keys(e.constraints ?? {}),
        })),
      );
    return value;
  }

  private view(record: SyncOperation): SyncResult {
    return {
      operationId: record.operationId,
      status: record.status,
      code: record.resultCode,
      message: record.resultMessage,
      detail: record.resultDetail ?? undefined,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      attempts: record.attempts,
      processedAt: record.processedAt,
    };
  }

  /** GET /sync/operations/:deviceId: estado de las operaciones propias de un dispositivo. */
  async status(
    deviceId: string,
    user: AuthenticatedUser,
    operationIds?: string[],
  ) {
    const rows = await this.prisma.syncOperation.findMany({
      where: {
        deviceId,
        userId: user.id,
        ...(operationIds?.length ? { operationId: { in: operationIds } } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      ...this.view(row),
      type: row.type,
      createdAtLocal: row.createdAtLocal,
    }));
  }

  /** F4.7: bitacora para el administrador (sin payload ni datos personales). */
  async logs(query: SyncLogsQueryDto, user: AuthenticatedUser) {
    const branchId = user.roles.includes(Role.ADMINISTRATOR)
      ? undefined
      : ((await this.prisma.employee.findUnique({ where: { userId: user.id } }))
          ?.branchId ?? -1);
    const where: Prisma.SyncLogWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.errorCode ? { errorCode: query.errorCode } : {}),
      ...(branchId !== undefined ? { syncOperation: { branchId } } : {}),
    };
    const [data, total, summary] = await Promise.all([
      this.prisma.syncLog.findMany({
        where,
        include: {
          syncOperation: {
            select: {
              operationId: true,
              type: true,
              branchId: true,
              deviceId: true,
              userId: true,
              status: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.syncLog.count({ where }),
      this.prisma.syncOperation.groupBy({
        by: ['status', 'resultCode'],
        where: branchId !== undefined ? { branchId } : {},
        _count: { _all: true },
      }),
    ]);
    return {
      data,
      summary: summary.map((row) => ({
        status: row.status,
        code: row.resultCode,
        count: row._count._all,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
