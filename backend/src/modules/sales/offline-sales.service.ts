import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SalesRepository } from './sales.repository.js';
import { SalesService } from './sales.service.js';
import {
  FinishOfflineDto,
  OfflineSaleDto,
  PrepareOfflineDto,
} from './dto/offline.dto.js';
import {
  fingerprint,
  presentLine,
  priceLine,
  saleTotal,
  sortedItems,
  variantKey,
} from './sale-pricing.js';

interface OfflineVariant {
  productId: number;
  sizeId: number;
  colorId: number;
  available: number;
  productName: string;
  sizeName: string;
  colorName: string;
  unitPrice: number;
  discount: number;
  netUnitPrice: number;
}
@Injectable()
export class OfflineSalesService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly sales: SalesService,
  ) {}
  private async shift(
    id: number,
    user: AuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    const shift = await tx.cashShift.findUnique({
      where: { id },
      include: { register: { include: { branch: true } } },
    });
    if (!shift || shift.userId !== user.id)
      throw new NotFoundException('Turno propio no encontrado.');
    if (!user.roles.includes(Role.ADMINISTRATOR)) {
      const employee = await tx.employee.findUnique({
        where: { userId: user.id },
      });
      if (!employee?.active || employee.branchId !== shift.register.branchId)
        throw new ForbiddenException(
          'Solo puedes sincronizar en tu sucursal asignada.',
        );
    }
    return shift;
  }
  prepare(dto: PrepareOfflineDto, user: AuthenticatedUser) {
    return this.repository.transaction(async (tx) => {
      const shift = await this.shift(dto.shiftId, user, tx);
      if (shift.closedAt || !shift.register.branch.active)
        throw new ConflictException('Abre un turno en una sucursal activa.');
      const replay = await tx.offlineBatch.findUnique({
        where: { id: dto.id },
      });
      if (replay) {
        if (replay.deviceId !== dto.deviceId || replay.shiftId !== shift.id)
          throw new ConflictException(
            'La preparacion pertenece a otro dispositivo o turno.',
          );
        if (replay.finishedAt)
          throw new ConflictException(
            'La preparacion ya finalizo. Inicia una nueva.',
          );
        return replay;
      }
      const current = await tx.offlineBatch.findFirst({
        where: { shiftId: shift.id, finishedAt: null },
      });
      if (current) {
        if (current.deviceId !== dto.deviceId)
          throw new ConflictException(
            'Este turno tiene modo offline en otro dispositivo. Sincronizalo primero.',
          );
        return current;
      }
      await tx.cashShift.update({
        where: { id: shift.id },
        data: { saleCount: { increment: 0 } },
      });
      const rows = await tx.inventory.findMany({
        where: { branchId: shift.register.branchId, product: { active: true } },
        include: { product: true, size: true, color: true },
        orderBy: { id: 'asc' },
        take: 2001,
      });
      if (rows.length > 2000)
        throw new BadRequestException(
          'El modo offline de demostracion admite hasta 2000 variantes por sucursal.',
        );
      const now = new Date();
      const variants = rows
        .filter((r) => r.physicalQuantity > r.reservedQuantity)
        .map((r) => ({
          ...presentLine(
            priceLine(
              {
                productId: r.productId,
                sizeId: r.sizeId,
                colorId: r.colorId,
                quantity: 1,
              },
              r.product,
              r.size.name,
              r.color.name,
              now,
            ),
          ),
          available: r.physicalQuantity - r.reservedQuantity,
        }));
      if (!variants.length)
        throw new ConflictException(
          'No hay variantes disponibles para descargar.',
        );
      return tx.offlineBatch.create({
        data: {
          id: dto.id,
          deviceId: dto.deviceId,
          shiftId: shift.id,
          preparedAt: now,
          snapshot: {
            branchId: shift.register.branchId,
            branchName: shift.register.branch.name,
            registerName: shift.register.name,
            userId: user.id,
            currency: shift.currency,
            expiresAt: new Date(now.getTime() + 86400000).toISOString(),
            variants,
          },
        },
      });
    });
  }
  async sync(id: string, dto: OfflineSaleDto, user: AuthenticatedUser) {
    const items = sortedItems(dto.items);
    const hash = fingerprint({
      offlineBatchId: id,
      deviceId: dto.deviceId,
      recordedAt: dto.recordedAt,
      expectedTotal: dto.expectedTotal,
      items,
      paymentMethod: 'CASH',
    });
    const saleId = await this.repository.transaction(async (tx) => {
      const batch = await tx.offlineBatch.findUnique({ where: { id } });
      if (!batch || batch.deviceId !== dto.deviceId)
        throw new NotFoundException(
          'Preparacion offline no encontrada para este dispositivo.',
        );
      const shift = await this.shift(batch.shiftId, user, tx);
      const replay = await this.repository.findRequest(
        user.id,
        dto.idempotencyKey,
        tx,
      );
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ConflictException(
            'El ticket ya se registro con otros datos.',
          );
        return replay.id;
      }
      if (batch.finishedAt || shift.closedAt)
        throw new ConflictException(
          'El lote o turno ya esta cerrado. No se borro tu ticket local.',
        );
      const snapshot = batch.snapshot as unknown as {
        variants: OfflineVariant[];
        expiresAt: string;
      };
      const recorded = new Date(dto.recordedAt);
      if (
        recorded.getTime() < batch.preparedAt.getTime() - 300000 ||
        recorded.getTime() > new Date(snapshot.expiresAt).getTime() ||
        recorded.getTime() > Date.now() + 300000
      )
        throw new BadRequestException(
          'La fecha del ticket no corresponde a la preparacion offline.',
        );
      if ((await tx.sale.count({ where: { offlineBatchId: id } })) >= 500)
        throw new ConflictException('Limite de 500 tickets por preparacion.');
      const used = await tx.saleItem.groupBy({
        by: ['productId', 'sizeId', 'colorId'],
        where: { sale: { offlineBatchId: id } },
        _sum: { quantity: true },
      });
      const lines = items.map((i) => {
        const v = snapshot.variants.find(
          (v) => variantKey(v) === variantKey(i),
        );
        const consumed =
          used.find((u) => variantKey(u) === variantKey(i))?._sum.quantity ?? 0;
        if (!v || i.quantity + consumed > v.available)
          throw new ConflictException(
            'El ticket excede las existencias descargadas.',
          );
        return {
          ...i,
          unitPrice: new Prisma.Decimal(v.unitPrice),
          discount: new Prisma.Decimal(v.discount),
          productName: v.productName,
          sizeName: v.sizeName,
          colorName: v.colorName,
        };
      });
      const total = saleTotal(lines);
      if (!total.equals(dto.expectedTotal))
        throw new ConflictException(
          'El total no coincide con los precios descargados del servidor.',
        );
      await tx.offlineBatch.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
      await this.repository.recordShiftSale(
        shift.id,
        user.id,
        shift.register.branchId,
        shift.currency,
        'CASH',
        total,
        tx,
      );
      const employeeId = (
        await tx.employee.findUnique({ where: { userId: user.id } })
      )?.id;
      const sale = await this.repository.create(
        {
          offlineBatchId: id,
          shiftId: shift.id,
          branchId: shift.register.branchId,
          employeeId,
          createdById: user.id,
          idempotencyKey: dto.idempotencyKey,
          requestHash: hash,
          channel: 'IN_STORE',
          status: 'COMPLETED',
          currency: shift.currency,
          soldAt: recorded,
          confirmedAt: new Date(),
          total,
          items: { create: lines },
          payments: {
            create: {
              method: 'CASH',
              type: 'IN_STORE',
              status: 'APPROVED',
              amount: total,
              paidAt: recorded,
            },
          },
        },
        tx,
      );
      for (const item of items) {
        const stock = await this.repository.findStock(
          shift.register.branchId,
          item,
          tx,
          false,
        );
        if (
          !stock ||
          stock.physicalQuantity - stock.reservedQuantity < item.quantity
        )
          throw new ConflictException(
            'Stock insuficiente al sincronizar. Conserva el ticket y resuelve las existencias antes de reintentar.',
          );
        await this.repository.changeStock(stock, -item.quantity, 0, tx);
        await this.repository.movement(
          {
            inventoryId: stock.id,
            employeeId,
            type: 'SALE',
            quantity: item.quantity,
            reference: `SALE:${sale.id}`,
          },
          tx,
        );
      }
      return sale.id;
    });
    return this.sales.findOne(saleId, user);
  }
  finish(id: string, dto: FinishOfflineDto, user: AuthenticatedUser) {
    return this.repository.transaction(async (tx) => {
      const batch = await tx.offlineBatch.findUnique({ where: { id } });
      if (!batch || batch.deviceId !== dto.deviceId)
        throw new NotFoundException('Preparacion offline no encontrada.');
      await this.shift(batch.shiftId, user, tx);
      const sales = await tx.sale.findMany({
        where: { offlineBatchId: id },
        select: { idempotencyKey: true },
      });
      const actual = sales.map((s) => s.idempotencyKey!).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...dto.keys].sort()))
        throw new ConflictException(
          'Los tickets locales no coinciden con los sincronizados. Revisa la cola.',
        );
      if (batch.finishedAt) return { finishedAt: batch.finishedAt };
      const result = await tx.offlineBatch.update({
        where: { id },
        data: { finishedAt: new Date(), revision: { increment: 1 } },
      });
      return { finishedAt: result.finishedAt };
    });
  }
}
