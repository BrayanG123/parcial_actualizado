import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SalesRepository } from '../sales/sales.repository.js';
import { priceLine } from '../sales/sale-pricing.js';
import { CreateExchangeDto } from './dto/exchange.dto.js';

const STAFF = [Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER];
const DIA_MS = 86_400_000;

/** Error con codigo estable (lo usan la UI y /sync/operations para clasificar conflictos). */
const conflicto = (code: string, message: string, detail?: unknown) =>
  new ConflictException({ code, message, detail });

const exchangeInclude = {
  creditNote: {
    select: { code: true, amount: true, balance: true, status: true },
  },
  saleItem: { select: { productName: true, sizeName: true, colorName: true } },
} satisfies Prisma.ExchangeInclude;

/**
 * Cambios de prendas (F7.2). En una transaccion serializable: valida plazo, cantidad
 * disponible para cambio, prenda nueva y stock; devuelve la prenda al inventario
 * (kardex RETURN), descuenta la nueva (kardex SALE) y liquida la diferencia: cobro en
 * efectivo al turno o nota de credito a favor del cliente (F7.3).
 */
@Injectable()
export class ExchangesService {
  constructor(private readonly repository: SalesRepository) {}

  private async branchFor(
    user: AuthenticatedUser,
    requested: number | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (!user.roles.some((r) => STAFF.includes(r)))
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Solo el personal registra cambios',
      });
    if (user.roles.includes(Role.ADMINISTRATOR))
      return { branchId: requested, employeeId: undefined };
    const employee = await tx.employee.findUnique({
      where: { userId: user.id },
    });
    if (!employee?.active)
      throw new ForbiddenException({
        code: 'BRANCH_NOT_AUTHORIZED',
        message: 'Empleado sin sucursal activa',
      });
    if (requested && requested !== employee.branchId)
      throw conflicto(
        'BRANCH_NOT_AUTHORIZED',
        'Solo puedes registrar cambios en tu sucursal',
      );
    return { branchId: employee.branchId, employeeId: employee.id };
  }

  private async windowDays(tx: Prisma.TransactionClient) {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantContext.requireTenantId() },
    });
    return tenant?.exchangeWindowDays ?? 7;
  }

  /** Venta con lo que queda por cambiar, plazo y prendas candidatas de la sucursal. */
  async options(
    saleId: number,
    user: AuthenticatedUser,
    requestedBranch?: number,
  ) {
    return this.repository.transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true, exchanges: { include: exchangeInclude } },
      });
      if (!sale)
        throw new NotFoundException({
          code: 'SALE_NOT_FOUND',
          message: `Venta ${saleId} no encontrada`,
        });
      const { branchId } = await this.branchFor(user, requestedBranch, tx);
      const branch = branchId ?? sale.branchId;
      const days = await this.windowDays(tx);
      const base = sale.confirmedAt ?? sale.soldAt;
      const deadline = new Date(base.getTime() + days * DIA_MS);
      const now = new Date();
      const candidates = branch
        ? await tx.inventory.findMany({
            where: { branchId: branch, product: { active: true } },
            include: { product: true, size: true, color: true },
            orderBy: [{ productId: 'asc' }, { id: 'asc' }],
            take: 500,
          })
        : [];
      return {
        sale: {
          id: sale.id,
          status: sale.status,
          soldAt: sale.soldAt,
          total: sale.total,
          branchId: sale.branchId,
          clientId: sale.clientId,
        },
        windowDays: days,
        deadline,
        withinWindow: sale.status === 'COMPLETED' && now <= deadline,
        branchId: branch,
        items: sale.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          sizeId: i.sizeId,
          colorId: i.colorId,
          productName: i.productName,
          sizeName: i.sizeName,
          colorName: i.colorName,
          quantity: i.quantity,
          exchangedQuantity: i.exchangedQuantity,
          exchangeable: i.quantity - i.exchangedQuantity,
          paidUnitPrice: i.unitPrice.minus(i.discount),
        })),
        exchanges: sale.exchanges,
        candidates: candidates
          .filter((c) => c.physicalQuantity - c.reservedQuantity > 0)
          .map((c) => {
            const line = priceLine(
              {
                productId: c.productId,
                sizeId: c.sizeId,
                colorId: c.colorId,
                quantity: 1,
              },
              c.product,
              c.size.name,
              c.color.name,
              now,
            );
            return {
              productId: c.productId,
              sizeId: c.sizeId,
              colorId: c.colorId,
              productName: c.product.name,
              sizeName: c.size.name,
              colorName: c.color.name,
              unitPrice: line.unitPrice.minus(line.discount),
              available: c.physicalQuantity - c.reservedQuantity,
            };
          }),
      };
    });
  }

  async create(
    dto: CreateExchangeDto,
    user: AuthenticatedUser,
    options: { operationKey?: string; exchangedAt?: Date } = {},
  ) {
    const exchangedAt = options.exchangedAt ?? new Date();
    return this.repository.transaction(async (tx) => {
      if (options.operationKey) {
        const replay = await tx.exchange.findFirst({
          where: { operationKey: options.operationKey },
          include: exchangeInclude,
        });
        if (replay) return replay;
      }
      const { branchId: allowedBranch, employeeId } = await this.branchFor(
        user,
        dto.branchId,
        tx,
      );
      const sale = await tx.sale.findUnique({
        where: { id: dto.saleId },
        include: { items: true },
      });
      if (!sale)
        throw new NotFoundException({
          code: 'SALE_NOT_FOUND',
          message: `Venta ${dto.saleId} no encontrada`,
        });
      if (sale.status !== 'COMPLETED')
        throw conflicto(
          'SALE_NOT_COMPLETED',
          'Solo se cambian prendas de ventas completadas',
        );
      const item = dto.saleItemId
        ? sale.items.find((i) => i.id === dto.saleItemId)
        : (sale.items.find(
            (i) =>
              i.productId === dto.returnedProductId &&
              i.sizeId === dto.returnedSizeId &&
              i.colorId === dto.returnedColorId &&
              i.exchangedQuantity < i.quantity,
          ) ??
          sale.items.find(
            (i) =>
              i.productId === dto.returnedProductId &&
              i.sizeId === dto.returnedSizeId &&
              i.colorId === dto.returnedColorId,
          ));
      if (!item)
        throw new NotFoundException({
          code: 'SALE_ITEM_NOT_FOUND',
          message: 'La prenda no pertenece a la venta',
        });
      const branchId = allowedBranch ?? sale.branchId;
      if (!branchId)
        throw new BadRequestException({
          code: 'INVALID_DATA',
          message: 'Indica la sucursal del cambio',
        });

      const days = await this.windowDays(tx);
      const deadline = new Date(
        (sale.confirmedAt ?? sale.soldAt).getTime() + days * DIA_MS,
      );
      if (exchangedAt > deadline)
        throw conflicto(
          'EXCHANGE_WINDOW_EXPIRED',
          `El plazo de cambio (${days} dias) vencio`,
          {
            deadline,
            windowDays: days,
          },
        );
      const remaining = item.quantity - item.exchangedQuantity;
      if (dto.quantity > remaining)
        throw conflicto(
          'ALREADY_EXCHANGED',
          'No quedan tantas unidades de esa prenda por cambiar',
          { remaining },
        );

      const branch = await tx.branch.findUnique({ where: { id: branchId } });
      if (!branch?.active)
        throw conflicto('BRANCH_INACTIVE', 'La sucursal esta inactiva');
      const product = await tx.product.findUnique({
        where: { id: dto.newProductId },
        include: {
          sizes: { include: { size: true } },
          colors: { include: { color: true } },
        },
      });
      const size = product?.sizes.find((s) => s.sizeId === dto.newSizeId);
      const color = product?.colors.find((c) => c.colorId === dto.newColorId);
      if (!product?.active || !size || !color)
        throw conflicto(
          'PRODUCT_INACTIVE',
          'La prenda nueva no esta disponible',
          {
            variants: [
              {
                productId: dto.newProductId,
                sizeId: dto.newSizeId,
                colorId: dto.newColorId,
              },
            ],
          },
        );

      const returnedUnit = item.unitPrice.minus(item.discount);
      const line = priceLine(
        {
          productId: dto.newProductId,
          sizeId: dto.newSizeId,
          colorId: dto.newColorId,
          quantity: dto.quantity,
        },
        product,
        size.size.name,
        color.color.name,
        exchangedAt,
      );
      const newUnit = line.unitPrice.minus(line.discount);
      const difference = newUnit
        .minus(returnedUnit)
        .mul(dto.quantity)
        .toDecimalPlaces(2);
      if (
        dto.expectedDifference !== undefined &&
        !difference.equals(dto.expectedDifference)
      )
        throw conflicto(
          'PRICE_CHANGED',
          'La diferencia de precio cambio respecto a la calculada',
          {
            expectedDifference: dto.expectedDifference,
            currentDifference: difference.toNumber(),
          },
        );

      // Marca las unidades como cambiadas solo si nadie las cambio en paralelo.
      const marked = await tx.saleItem.updateMany({
        where: { id: item.id, exchangedQuantity: item.exchangedQuantity },
        data: { exchangedQuantity: { increment: dto.quantity } },
      });
      if (marked.count !== 1)
        throw conflicto(
          'CONCURRENT_UPDATE',
          'La venta cambio durante la operacion; reintenta',
        );

      // 1) La prenda devuelta vuelve al stock de la sucursal del cambio.
      const returned = {
        productId: item.productId,
        sizeId: item.sizeId,
        colorId: item.colorId,
      };
      let returnedStock = await this.repository.findStock(
        branchId,
        returned,
        tx,
        false,
      );
      if (!returnedStock) {
        await tx.inventory.create({
          data: { branchId, ...returned, physicalQuantity: 0 },
        });
        returnedStock = await this.repository.findStock(
          branchId,
          returned,
          tx,
          false,
        );
      }
      await this.repository.changeStock(returnedStock!, dto.quantity, 0, tx);
      // 2) La prenda nueva sale del stock disponible.
      const fresh = {
        productId: dto.newProductId,
        sizeId: dto.newSizeId,
        colorId: dto.newColorId,
      };
      const newStock = await this.repository.findStock(
        branchId,
        fresh,
        tx,
        false,
      );
      const available = newStock
        ? newStock.physicalQuantity - newStock.reservedQuantity
        : 0;
      if (!newStock || available < dto.quantity)
        throw conflicto(
          'STOCK_INSUFFICIENT',
          'No hay existencias de la prenda nueva',
          {
            variants: [{ ...fresh, requested: dto.quantity, available }],
          },
        );
      await this.repository.changeStock(newStock, -dto.quantity, 0, tx);

      const settlement = difference.gt(0)
        ? 'CHARGED'
        : difference.lt(0)
          ? 'CREDIT_NOTE'
          : 'EVEN';
      if (settlement === 'CHARGED') {
        if (!dto.shiftId)
          throw new BadRequestException({
            code: 'SHIFT_REQUIRED',
            message: 'Indica el turno donde se cobra la diferencia',
          });
        const charged = await tx.cashShift.updateMany({
          where: {
            id: dto.shiftId,
            userId: user.id,
            closedAt: null,
            register: { branchId },
          },
          data: { cashTotal: { increment: difference } },
        });
        if (charged.count !== 1)
          throw conflicto(
            'SHIFT_CLOSED',
            'El turno para cobrar la diferencia no esta abierto en esta sucursal',
          );
      }
      const exchange = await tx.exchange.create({
        data: {
          saleId: sale.id,
          saleItemId: item.id,
          branchId,
          shiftId: settlement === 'CHARGED' ? dto.shiftId : null,
          createdById: user.id,
          employeeId,
          operationKey: options.operationKey,
          quantity: dto.quantity,
          returnedProductId: item.productId,
          returnedSizeId: item.sizeId,
          returnedColorId: item.colorId,
          returnedUnitPrice: returnedUnit,
          newProductId: dto.newProductId,
          newSizeId: dto.newSizeId,
          newColorId: dto.newColorId,
          newProductName: `${product.name} (${size.size.name} / ${color.color.name})`,
          newUnitPrice: newUnit,
          difference,
          settlement,
          reason: dto.reason,
          exchangedAt,
          ...(settlement === 'CREDIT_NOTE'
            ? {
                creditNote: {
                  create: {
                    code: `NC-${randomBytes(4).toString('hex').toUpperCase()}`,
                    clientId: sale.clientId,
                    amount: difference.abs(),
                    balance: difference.abs(),
                  },
                },
              }
            : {}),
        },
        include: exchangeInclude,
      });
      const reference = `EXCHANGE:${exchange.id}`;
      await this.repository.movement(
        {
          inventoryId: returnedStock!.id,
          employeeId,
          type: 'RETURN',
          quantity: dto.quantity,
          reference,
          observation: `Cambio de venta ${sale.id}`,
        },
        tx,
      );
      await this.repository.movement(
        {
          inventoryId: newStock.id,
          employeeId,
          type: 'SALE',
          quantity: dto.quantity,
          reference,
          observation: `Cambio de venta ${sale.id}`,
        },
        tx,
      );
      return exchange;
    });
  }

  list(saleId?: number) {
    return this.repository.transaction((tx) =>
      tx.exchange.findMany({
        where: saleId ? { saleId } : {},
        include: exchangeInclude,
        orderBy: { exchangedAt: 'desc' },
        take: 100,
      }),
    );
  }

  async creditNote(code: string) {
    const note = await this.repository.transaction((tx) =>
      tx.creditNote.findFirst({
        where: { code: code.toUpperCase() },
        include: {
          client: { select: { id: true, user: { select: { name: true } } } },
        },
      }),
    );
    if (!note)
      throw new NotFoundException({
        code: 'CREDIT_NOTE_NOT_FOUND',
        message: 'Nota de credito no encontrada',
      });
    return note;
  }

  /** Canje (total o parcial) de una nota de credito como medio de pago en caja. */
  redeem(code: string, amount: number) {
    return this.repository.transaction(async (tx) => {
      const note = await tx.creditNote.findFirst({
        where: { code: code.toUpperCase() },
      });
      if (!note)
        throw new NotFoundException({
          code: 'CREDIT_NOTE_NOT_FOUND',
          message: 'Nota de credito no encontrada',
        });
      if (note.status !== 'ACTIVE' || note.balance.lt(amount))
        throw conflicto(
          'CREDIT_NOTE_INSUFFICIENT',
          'La nota de credito no tiene saldo suficiente',
          { balance: note.balance },
        );
      const balance = note.balance.minus(amount);
      const updated = await tx.creditNote.updateMany({
        where: { id: note.id, balance: note.balance },
        data: { balance, status: balance.isZero() ? 'USED' : 'ACTIVE' },
      });
      if (updated.count !== 1)
        throw conflicto(
          'CONCURRENT_UPDATE',
          'La nota cambio durante la operacion; reintenta',
        );
      return {
        code: note.code,
        balance,
        status: balance.isZero() ? 'USED' : 'ACTIVE',
      };
    });
  }
}
