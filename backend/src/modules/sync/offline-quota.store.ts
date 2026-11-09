import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Operaciones del cupo offline dentro de una transaccion (serializable, la del POS).
 *
 * El cupo aparta unidades en `cantidad_reservada`: mientras esta activo, ni otra caja
 * ni la tienda en linea pueden venderlas, y la caja que lo tiene si puede venderlas
 * sin conexion. Asi la ultima prenda no se vende dos veces.
 */

/** Devuelve al stock libre lo que no se vendio y marca los cupos como liberados. */
export async function releaseQuotas(
  tx: Prisma.TransactionClient,
  where: Prisma.OfflineQuotaWhereInput,
): Promise<number> {
  const quotas = await tx.offlineQuota.findMany({
    where: { ...where, status: 'ACTIVE' },
    include: { items: true },
  });
  for (const quota of quotas) {
    for (const item of quota.items) {
      const remaining = item.allocated - item.used;
      if (remaining <= 0) continue;
      const changed = await tx.inventory.updateMany({
        where: { id: item.inventoryId, reservedQuantity: { gte: remaining } },
        data: { reservedQuantity: { decrement: remaining } },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Inventario inconsistente al liberar el cupo offline',
        );
    }
    await tx.offlineQuota.update({
      where: { id: quota.id },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
  }
  return quotas.length;
}

/**
 * Cupo con el que se confirma una venta offline: el del mismo usuario, turno, sucursal y
 * dispositivo. Sirve aunque haya vencido si la venta se registro antes del vencimiento
 * (mientras no se haya liberado).
 */
export function findQuotaForSale(
  tx: Prisma.TransactionClient,
  args: {
    userId: number;
    shiftId: number;
    branchId: number;
    deviceId: string;
    recordedAt: Date;
  },
) {
  return tx.offlineQuota.findFirst({
    where: {
      status: 'ACTIVE',
      userId: args.userId,
      shiftId: args.shiftId,
      branchId: args.branchId,
      deviceId: args.deviceId,
      createdAt: { lte: new Date(args.recordedAt.getTime() + 60_000) },
      expiresAt: { gte: args.recordedAt },
    },
    include: { items: true },
  });
}

/** Unidades del cupo que todavia puede vender la caja para un inventario. */
export function quotaRemaining(
  quota: { items: Array<{ inventoryId: number; allocated: number; used: number }> } | null,
  inventoryId: number,
): number {
  const item = quota?.items.find((i) => i.inventoryId === inventoryId);
  return item ? Math.max(0, item.allocated - item.used) : 0;
}

/** Registra lo vendido del cupo (la reserva ya se desconto al cambiar el stock). */
export async function useQuota(
  tx: Prisma.TransactionClient,
  quotaId: number,
  inventoryId: number,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  const changed = await tx.offlineQuotaItem.updateMany({
    where: { quotaId, inventoryId },
    data: { used: { increment: quantity } },
  });
  if (changed.count !== 1)
    throw new ConflictException('El cupo offline cambio; reintenta');
}
