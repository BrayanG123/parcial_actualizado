import { ConflictException, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ListSalesQueryDto } from './dto/list-sales-query.dto.js';
import { SaleItemDto } from './dto/sale-item.dto.js';

const saleInclude = {
  items: {
    include: { product: { select: { name: true } }, size: true, color: true },
    orderBy: { id: 'asc' as const },
  },
  payments: { orderBy: { id: 'asc' as const } },
  branch: { select: { id: true, name: true, city: true, address: true } },
  client: {
    select: {
      id: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
  },
  employee: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.SaleInclude;

export type SaleRecord = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;
export interface StockSnapshot {
  id: number;
  physicalQuantity: number;
  reservedQuantity: number;
}

@Injectable()
export class SalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 20000,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)
        )
          throw error;
        if (attempt >= 3)
          throw new ConflictException(
            'Concurrent sale or duplicate payment reference; retry with the same idempotency key',
          );
        await delay(25 * (attempt + 1));
      }
    }
  }

  async requireOnlineShift(shiftId: number, tx: Prisma.TransactionClient) {
    if (
      await tx.offlineBatch.findFirst({ where: { shiftId, finishedAt: null } })
    )
      throw new ConflictException(
        'Finaliza y sincroniza el modo offline antes de usar la caja normal.',
      );
  }

  async recordShiftSale(
    shiftId: number,
    userId: number,
    branchId: number,
    currency: string,
    method: 'CASH' | 'CARD' | 'QR' | 'BANK_TRANSFER',
    total: Prisma.Decimal,
    tx: Prisma.TransactionClient,
  ) {
    const field = {
      CASH: 'cashTotal',
      CARD: 'cardTotal',
      QR: 'qrTotal',
      BANK_TRANSFER: 'transferTotal',
    }[method];
    const updated = await tx.cashShift.updateMany({
      where: {
        id: shiftId,
        userId,
        closedAt: null,
        currency,
        register: { branchId },
      },
      data: { saleCount: { increment: 1 }, [field]: { increment: total } },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        'Abre un turno propio en esta sucursal antes de cobrar. El turno indicado no esta abierto o su moneda cambio.',
      );
  }

  findClient(userId: number, tx: Prisma.TransactionClient) {
    return tx.client.findFirst({
      where: { userId, user: { active: true } },
      select: { id: true, wholesale: true },
    });
  }

  searchPosCustomers(search: string, tx: Prisma.TransactionClient) {
    return tx.client.findMany({
      where: {
        user: {
          active: true,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
      select: {
        id: true,
        wholesale: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { id: 'asc' },
      take: 20,
    });
  }

  findPosReservation(id: number, tx: Prisma.TransactionClient) {
    return tx.reservation.findUnique({
      where: { id },
      include: {
        sale: { select: { id: true } },
        client: {
          select: {
            id: true,
            wholesale: true,
            user: { select: { name: true, email: true, active: true } },
          },
        },
        items: {
          include: {
            product: { select: { name: true } },
            size: true,
            color: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  findClientById(id: number, tx: Prisma.TransactionClient) {
    return tx.client.findFirst({
      where: { id, user: { active: true } },
      select: { id: true, wholesale: true },
    });
  }

  findEmployee(userId: number, tx: Prisma.TransactionClient = this.prisma) {
    return tx.employee.findUnique({
      where: { userId },
      select: { id: true, branchId: true, active: true },
    });
  }

  findBranch(id: number, tx: Prisma.TransactionClient) {
    return tx.branch.findUnique({ where: { id }, select: { active: true } });
  }

  findCart(id: number, clientId: number, tx: Prisma.TransactionClient) {
    return tx.cart.findFirst({
      where: { id, clientId, status: 'ACTIVE' },
      include: { items: true, client: { select: { wholesale: true } } },
    });
  }

  convertCart(id: number, tx: Prisma.TransactionClient) {
    return tx.cart.update({ where: { id }, data: { status: 'CONVERTED' } });
  }

  findReservation(id: number, tx: Prisma.TransactionClient) {
    return tx.reservation.findUnique({
      where: { id },
      include: { items: true, sale: { select: { id: true } } },
    });
  }

  finishReservationItem(
    id: number,
    purchasedQuantity: number,
    tx: Prisma.TransactionClient,
  ) {
    return tx.reservationItem.update({
      where: { id },
      data: {
        purchasedQuantity,
        status: purchasedQuantity > 0 ? 'PURCHASED' : 'RETURNED',
      },
    });
  }

  finishReservation(id: number, tx: Prisma.TransactionClient) {
    return tx.reservation.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  findStock(
    branchId: number,
    item: Pick<SaleItemDto, 'productId' | 'sizeId' | 'colorId'>,
    tx: Prisma.TransactionClient,
    activeOnly = true,
  ) {
    return tx.inventory.findFirst({
      where: {
        branchId,
        productId: item.productId,
        sizeId: item.sizeId,
        colorId: item.colorId,
        ...(activeOnly
          ? {
              product: {
                active: true,
                sizes: { some: { sizeId: item.sizeId } },
                colors: { some: { colorId: item.colorId } },
              },
            }
          : {}),
      },
      include: { product: true, size: true, color: true },
    });
  }

  async changeStock(
    stock: StockSnapshot,
    physicalDelta: number,
    reservedDelta: number,
    tx: Prisma.TransactionClient,
  ) {
    const physicalQuantity = stock.physicalQuantity + physicalDelta;
    const reservedQuantity = stock.reservedQuantity + reservedDelta;
    if (
      physicalQuantity < 0 ||
      reservedQuantity < 0 ||
      reservedQuantity > physicalQuantity
    ) {
      throw new ConflictException('Insufficient or inconsistent inventory');
    }
    const changed = await tx.inventory.updateMany({
      where: {
        id: stock.id,
        physicalQuantity: stock.physicalQuantity,
        reservedQuantity: stock.reservedQuantity,
      },
      data: { physicalQuantity, reservedQuantity },
    });
    if (changed.count !== 1)
      throw new ConflictException('Inventory changed concurrently; retry');
  }

  movement(
    data: Prisma.InventoryMovementUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.inventoryMovement.create({ data });
  }

  create(data: Prisma.SaleUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.sale.create({ data, include: saleInclude });
  }

  findById(id: number, tx: Prisma.TransactionClient = this.prisma) {
    return tx.sale.findUnique({ where: { id }, include: saleInclude });
  }

  findRequest(
    createdById: number,
    idempotencyKey: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.sale.findUnique({
      where: { createdById_idempotencyKey: { createdById, idempotencyKey } },
      include: saleInclude,
    });
  }

  update(
    id: number,
    data: Prisma.SaleUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.sale.update({ where: { id }, data, include: saleInclude });
  }

  updatePayment(
    id: number,
    data: Prisma.PaymentUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.payment.update({ where: { id }, data });
  }

  async findAll(query: ListSalesQueryDto, clientUserId?: number) {
    const where: Prisma.SaleWhereInput = {
      branchId: query.branchId,
      status: query.status,
      channel: query.channel,
      ...(clientUserId ? { client: { userId: clientUserId } } : {}),
      soldAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: saleInclude,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.sale.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  findExpired(now: Date, afterId: number) {
    return this.prisma.sale.findMany({
      where: {
        id: { gt: afterId },
        status: 'PENDING_PAYMENT',
        stockReserved: true,
        expiresAt: { lte: now },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
  }
}
