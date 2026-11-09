import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { SalesRepository } from '../sales/sales.repository.js';
import { releaseQuotas } from './offline-quota.store.js';
import { SyncSnapshotService } from './sync-snapshot.service.js';

/** Tiempo en el que la caja puede vender con el cupo sin volver a conectarse. */
export const QUOTA_HOURS = 12;
/** Margen para sincronizar ventas registradas antes del vencimiento antes de liberar. */
export const QUOTA_GRACE_HOURS = 12;

const STAFF = [Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER];

/**
 * Cupo offline (consistencia de inventario, Desafio IV): antes de quedarse sin conexion
 * la caja aparta unidades de su sucursal. Solo ella puede venderlas offline; la tienda
 * en linea y las otras cajas ven ese stock como reservado. Al sincronizar, las ventas
 * consumen primero su cupo; al cerrar el turno, liberar o vencer, lo no vendido vuelve
 * al stock libre.
 */
@Injectable()
export class OfflineQuotaService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly snapshots: SyncSnapshotService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: { deviceId: string; branchId?: number; perVariant?: number },
  ) {
    if (!user.roles.some((r) => STAFF.includes(r)))
      throw new ForbiddenException('Solo el personal de caja aparta cupo offline');
    await this.repository.transaction(async (tx) => {
      const shift = await tx.cashShift.findFirst({
        where: {
          userId: user.id,
          closedAt: null,
          ...(dto.branchId ? { register: { branchId: dto.branchId } } : {}),
        },
        include: { register: true },
      });
      if (!shift)
        throw new ConflictException(
          'Abre tu turno de caja con conexion antes de apartar el cupo offline',
        );
      const branchId = shift.register.branchId;
      if (!user.roles.includes(Role.ADMINISTRATOR)) {
        const employee = await tx.employee.findUnique({
          where: { userId: user.id },
        });
        if (!employee?.active || employee.branchId !== branchId)
          throw new ForbiddenException('Solo puedes apartar stock de tu sucursal');
      }
      // Un dispositivo tiene un solo cupo: el anterior se libera y se aparta de nuevo.
      await releaseQuotas(tx, { userId: user.id, deviceId: dto.deviceId });
      const rows = await tx.inventory.findMany({
        where: { branchId, product: { active: true } },
        orderBy: { id: 'asc' },
        take: 2000,
      });
      const items: Array<{ inventoryId: number; allocated: number }> = [];
      for (const row of rows) {
        const free = row.physicalQuantity - row.reservedQuantity;
        const allocated = Math.min(free, dto.perVariant ?? free);
        if (allocated <= 0) continue;
        await this.repository.changeStock(row, 0, allocated, tx);
        items.push({ inventoryId: row.id, allocated });
      }
      await tx.offlineQuota.create({
        data: {
          branchId,
          userId: user.id,
          shiftId: shift.id,
          deviceId: dto.deviceId,
          expiresAt: new Date(Date.now() + QUOTA_HOURS * 3_600_000),
          items: { create: items },
        },
      });
    });
    return this.snapshots.snapshot(user, dto.branchId, dto.deviceId);
  }

  async release(user: AuthenticatedUser, id: number, deviceId?: string) {
    await this.repository.transaction(async (tx) => {
      const quota = await tx.offlineQuota.findUnique({ where: { id } });
      if (!quota || quota.userId !== user.id)
        throw new NotFoundException('Cupo offline no encontrado');
      await releaseQuotas(tx, { id });
    });
    return this.snapshots.snapshot(user, undefined, deviceId);
  }

  /** Libera los cupos vencidos (con margen para sincronizar lo vendido antes del vencimiento). */
  releaseExpired(now = new Date()) {
    return this.repository.transaction((tx) =>
      releaseQuotas(tx, {
        expiresAt: { lt: new Date(now.getTime() - QUOTA_GRACE_HOURS * 3_600_000) },
      }),
    );
  }
}
