import { ConflictException, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma, ReservationStatus } from '../../generated/prisma/client.js';
import { ReservationItemDto } from './dto/reservation-item.dto.js';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto.js';
import { expirableStatuses } from './reservation-policy.js';
import { createReservationNotification } from '../notifications/reservation-notification.js';

const reservationInclude = {
  branch: { select: { id: true, name: true, city: true, address: true } },
  client: {
    select: {
      id: true,
      userId: true,
      phone: true,
      user: { select: { name: true, email: true } },
    },
  },
  items: {
    include: {
      product: { select: { id: true, name: true, imageUrl: true } },
      size: true,
      color: true,
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.ReservationInclude;

export type ReservationRecord = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;

@Injectable()
export class ReservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        ) {
          throw error;
        }
        if (attempt >= 3) {
          throw new ConflictException(
            'Stock or reservation changed concurrently; retry the operation',
          );
        }
        await delay(25 * (attempt + 1));
      }
    }
  }

  findClient(userId: number, tx: Prisma.TransactionClient = this.prisma) {
    return tx.client.findUnique({ where: { userId }, select: { id: true } });
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

  findById(id: number, tx: Prisma.TransactionClient = this.prisma) {
    return tx.reservation.findUnique({
      where: { id },
      include: reservationInclude,
    });
  }

  async findAll(query: ListReservationsQueryDto, clientId?: number) {
    const where: Prisma.ReservationWhereInput = {
      clientId,
      branchId: query.branchId,
      status: query.status,
      approximateTime: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        include: reservationInclude,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ approximateTime: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.reservation.count({ where }),
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

  async create(
    data: {
      clientId: number;
      branchId: number;
      approximateTime: Date;
      expiresAt: Date;
      observation?: string;
      items: ReservationItemDto[];
    },
    tx: Prisma.TransactionClient,
  ) {
    const reservation = await tx.reservation.create({
      data: { ...data, items: { create: data.items } },
      include: reservationInclude,
    });
    await createReservationNotification(tx, reservation);
    return reservation;
  }

  async requireAvailableStock(
    branchId: number,
    item: ReservationItemDto,
    tx: Prisma.TransactionClient,
  ) {
    const inventory = await tx.inventory.findFirst({
      where: {
        branchId,
        productId: item.productId,
        sizeId: item.sizeId,
        colorId: item.colorId,
        product: {
          active: true,
          sizes: { some: { sizeId: item.sizeId } },
          colors: { some: { colorId: item.colorId } },
        },
      },
    });
    if (
      !inventory ||
      inventory.physicalQuantity - inventory.reservedQuantity < item.quantity
    ) {
      throw new ConflictException(
        `Insufficient stock or invalid variant: product ${item.productId}, size ${item.sizeId}, color ${item.colorId}`,
      );
    }
    return inventory;
  }

  async reserveStock(
    branchId: number,
    item: ReservationItemDto,
    reservationId: number,
    tx: Prisma.TransactionClient,
  ) {
    const inventory = await this.requireAvailableStock(branchId, item, tx);
    const updated = await tx.inventory.updateMany({
      where: {
        id: inventory.id,
        reservedQuantity: inventory.reservedQuantity,
        physicalQuantity: { gte: inventory.reservedQuantity + item.quantity },
      },
      data: { reservedQuantity: { increment: item.quantity } },
    });
    if (updated.count !== 1)
      throw new ConflictException('Stock changed; retry the reservation');
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: 'RESERVATION',
        quantity: item.quantity,
        reference: `RESERVATION:${reservationId}`,
      },
    });
  }

  async releaseStock(
    reservation: ReservationRecord,
    tx: Prisma.TransactionClient,
    employeeId?: number,
  ) {
    const items = [...reservation.items].sort(
      (a, b) =>
        a.productId - b.productId ||
        a.sizeId - b.sizeId ||
        a.colorId - b.colorId,
    );
    for (const item of items) {
      // PURCHASED items will be consumed by the future Sales module.
      if (item.status !== 'PENDING' && item.status !== 'PREPARED') continue;
      const inventory = await tx.inventory.findUnique({
        where: {
          branchId_productId_sizeId_colorId: {
            branchId: reservation.branchId,
            productId: item.productId,
            sizeId: item.sizeId,
            colorId: item.colorId,
          },
        },
      });
      if (!inventory)
        throw new ConflictException('Reservation inventory is missing');
      const updated = await tx.inventory.updateMany({
        where: { id: inventory.id, reservedQuantity: { gte: item.quantity } },
        data: { reservedQuantity: { decrement: item.quantity } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Reserved stock is inconsistent');
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          employeeId,
          type: 'RESERVATION_RELEASE',
          quantity: item.quantity,
          reference: `RESERVATION:${reservation.id}`,
        },
      });
    }
    await tx.reservationItem.updateMany({
      where: {
        reservationId: reservation.id,
        status: { in: ['PENDING', 'PREPARED'] },
      },
      data: { status: 'RETURNED' },
    });
  }

  async updateStatus(
    id: number,
    status: ReservationStatus,
    tx: Prisma.TransactionClient,
  ) {
    if (status === 'READY') {
      await tx.reservationItem.updateMany({
        where: { reservationId: id, status: 'PENDING' },
        data: { status: 'PREPARED' },
      });
    }
    return tx.reservation.update({
      where: { id },
      data: { status },
      include: reservationInclude,
    });
  }

  findExpired(now: Date, afterId: number, limit: number) {
    return this.prisma.reservation.findMany({
      where: {
        id: { gt: afterId },
        status: { in: expirableStatuses },
        expiresAt: { lte: now },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
  }
}
