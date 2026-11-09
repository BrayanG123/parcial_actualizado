import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  AllowWhenReadOnly,
  RequiresFeature,
} from '../tenancy/plan.decorators.js';
import {
  CreateQuotaDto,
  ReleaseQuotaDto,
  SnapshotQueryDto,
  SyncBatchDto,
  SyncLogsQueryDto,
} from './dto/sync.dto.js';
import { SyncSnapshotService } from './sync-snapshot.service.js';
import { SyncService } from './sync.service.js';
import { OfflineQuotaService } from './offline-quota.service.js';

/** Contrato unico de sincronizacion offline para la PWA y la app movil. */
@Controller('sync')
@RequiresFeature('offline')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER, Role.CUSTOMER)
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly snapshots: SyncSnapshotService,
    private readonly quotas: OfflineQuotaService,
  ) {}

  /** Datos para operar offline en una sucursal (catalogo, precios, stock, clientes). */
  @Get('snapshot')
  snapshot(
    @Query() query: SnapshotQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.snapshots.snapshot(user, query.branchId, query.deviceId);
  }

  /**
   * Aparta stock para vender sin conexion (cupo offline) y devuelve la descarga con el
   * cupo como disponible. Solo esa caja puede vender esas unidades mientras este activo.
   */
  @Post('quota')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  createQuota(
    @Body() dto: CreateQuotaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotas.create(user, dto);
  }

  /** Devuelve al stock libre lo apartado y no vendido. */
  @Post('quota/:id/release')
  @HttpCode(200)
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  releaseQuota(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReleaseQuotaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotas.release(user, id, dto.deviceId);
  }

  /**
   * Lote de operaciones offline. Con la suscripcion vencida no se responde 403: cada
   * operacion vuelve como CONFLICT SUBSCRIPTION_INVALID y el cliente la conserva.
   */
  @Post('operations')
  @HttpCode(200)
  @AllowWhenReadOnly()
  operations(
    @Body() dto: SyncBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sync.process(dto, user);
  }

  @Get('operations/:deviceId')
  status(
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('ids') ids?: string,
  ) {
    return this.sync.status(
      deviceId,
      user,
      ids?.split(',').filter(Boolean).slice(0, 200),
    );
  }

  /** Observabilidad (F4.7): intentos, resultados y codigos de error. */
  @Get('logs')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER)
  logs(
    @Query() query: SyncLogsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sync.logs(query, user);
  }
}
