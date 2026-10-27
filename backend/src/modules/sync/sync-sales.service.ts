import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SalesRepository } from '../sales/sales.repository.js';
import {
  fingerprint,
  priceLine,
  saleTotal,
  sortedItems,
  variantKey,
} from '../sales/sale-pricing.js';
import { SaleCashPayloadDto } from './dto/sync.dto.js';
import { conflict, rejected } from './sync-outcome.js';

const STAFF = [Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER];

export interface SaleCashContext {
  operationId: string;
  branchId: number;
  recordedAt: Date;
  payload: SaleCashPayloadDto;
}

/**
 * Confirma una venta de contado registrada offline (F4.3). Usa el mismo repositorio
 * que el POS: venta + detalle + pago + turno + inventario + kardex en una sola
 * transaccion serializable. `operationId` es la clave de idempotencia de la venta.
 */
@Injectable()
export class SyncSalesService {
  constructor(private readonly repository: SalesRepository) {}

  confirm(context: SaleCashContext, user: AuthenticatedUser): Promise<number> {
    if (!user.roles.some((role) => STAFF.includes(role)))
      throw rejected(
        'ROLE_NOT_ALLOWED',
        'Solo el personal de caja puede registrar ventas',
      );
    const { payload, branchId, operationId, recordedAt } = context;
    let items: SaleCashPayloadDto['items'];
    try {
      items = sortedItems(payload.items);
    } catch (error) {
      throw rejected('INVALID_DATA', (error as Error).message);
    }
    const hash = fingerprint({ type: 'SALE_CASH', branchId, payload });
    return this.repository.transaction(async (tx) => {
      const replay = await this.repository.findRequest(
        user.id,
        operationId,
        tx,
      );
      if (replay) {
        if (replay.requestHash !== hash)
          throw rejected(
            'OPERATION_ID_REUSED',
            'El identificador ya se uso con otros datos',
          );
        return replay.id;
      }
      const shift = await tx.cashShift.findUnique({
        where: { id: payload.shiftId },
        include: { register: { include: { branch: true } } },
      });
      if (!shift || shift.userId !== user.id)
        throw rejected('SHIFT_NOT_FOUND', 'Turno propio no encontrado');
      if (shift.register.branchId !== branchId)
        throw conflict(
          'BRANCH_NOT_AUTHORIZED',
          'El turno pertenece a otra sucursal',
          { shiftBranchId: shift.register.branchId },
        );
      if (!user.roles.includes(Role.ADMINISTRATOR)) {
        const employee = await tx.employee.findUnique({
          where: { userId: user.id },
        });
        if (!employee?.active || employee.branchId !== branchId)
          throw conflict(
            'BRANCH_NOT_AUTHORIZED',
            'Solo puedes registrar ventas en tu sucursal asignada',
          );
      }
      if (!shift.register.branch.active)
        throw conflict('BRANCH_INACTIVE', 'La sucursal esta inactiva');
      if (shift.closedAt)
        throw conflict(
          'SHIFT_CLOSED',
          'El turno se cerro antes de sincronizar; abre uno nuevo y reintenta',
          { shiftId: shift.id, closedAt: shift.closedAt },
        );
      if (payload.clientId) {
        const client = await tx.client.findUnique({
          where: { id: payload.clientId },
        });
        if (!client) throw rejected('CLIENT_NOT_FOUND', 'El cliente no existe');
      }

      const products = await tx.product.findMany({
        where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
        include: {
          sizes: { include: { size: true } },
          colors: { include: { color: true } },
        },
      });
      const unavailable: unknown[] = [];
      const priceChanges: unknown[] = [];
      const lines = items.flatMap((item) => {
        const product = products.find((p) => p.id === item.productId);
        const size = product?.sizes.find((s) => s.sizeId === item.sizeId);
        const color = product?.colors.find((c) => c.colorId === item.colorId);
        if (!product?.active || !size || !color) {
          unavailable.push({
            productId: item.productId,
            sizeId: item.sizeId,
            colorId: item.colorId,
          });
          return [];
        }
        // Precio vigente del producto con la promocion que regia al registrar la venta.
        const line = priceLine(
          item,
          product,
          size.size.name,
          color.color.name,
          recordedAt,
        );
        const net = line.unitPrice.minus(line.discount);
        if (!net.equals(item.unitPrice))
          priceChanges.push({
            productId: item.productId,
            sizeId: item.sizeId,
            colorId: item.colorId,
            localUnitPrice: item.unitPrice,
            currentUnitPrice: net.toNumber(),
          });
        return [line];
      });
      if (unavailable.length)
        throw conflict(
          'PRODUCT_INACTIVE',
          'Una prenda o variante ya no esta disponible',
          { variants: unavailable },
        );
      if (priceChanges.length)
        throw conflict(
          'PRICE_CHANGED',
          'El precio de una prenda cambio respecto al usado en el dispositivo',
          { variants: priceChanges },
        );
      const total = saleTotal(lines);
      if (!total.equals(new Prisma.Decimal(payload.total)))
        throw rejected(
          'TOTAL_MISMATCH',
          'El total no coincide con las lineas de la venta',
          { expected: total.toNumber(), received: payload.total },
        );

      const stocks = [];
      const shortages: unknown[] = [];
      for (const item of items) {
        const stock = await this.repository.findStock(
          branchId,
          item,
          tx,
          false,
        );
        const available = stock
          ? stock.physicalQuantity - stock.reservedQuantity
          : 0;
        if (!stock || available < item.quantity)
          shortages.push({
            productId: item.productId,
            sizeId: item.sizeId,
            colorId: item.colorId,
            requested: item.quantity,
            available,
          });
        stocks.push(stock);
      }
      if (shortages.length)
        throw conflict(
          'STOCK_INSUFFICIENT',
          'No hay existencias suficientes para confirmar la venta',
          { variants: shortages },
        );

      await this.repository.recordShiftSale(
        shift.id,
        user.id,
        branchId,
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
          shiftId: shift.id,
          branchId,
          clientId: payload.clientId,
          employeeId,
          createdById: user.id,
          idempotencyKey: operationId,
          requestHash: hash,
          channel: 'IN_STORE',
          status: 'COMPLETED',
          currency: shift.currency,
          soldAt: recordedAt,
          confirmedAt: new Date(),
          total,
          items: { create: lines },
          payments: {
            create: {
              method: 'CASH',
              type: 'IN_STORE',
              status: 'APPROVED',
              amount: total,
              paidAt: recordedAt,
            },
          },
        },
        tx,
      );
      for (const [index, item] of items.entries()) {
        const stock = stocks[index]!;
        await this.repository.changeStock(stock, -item.quantity, 0, tx);
        await this.repository.movement(
          {
            inventoryId: stock.id,
            employeeId,
            type: 'SALE',
            quantity: item.quantity,
            reference: `SALE:${sale.id}`,
            observation: `Venta offline ${variantKey(item)} op ${operationId}`,
          },
          tx,
        );
      }
      return sale.id;
    });
  }
}
