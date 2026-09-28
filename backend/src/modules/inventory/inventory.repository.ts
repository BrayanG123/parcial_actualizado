import { Injectable } from '@nestjs/common';
import {
  InventoryMovementStatus,
  InventoryMovementType,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto.js';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto.js';

const inventorySelect = {
  id: true,
  physicalQuantity: true,
  reservedQuantity: true,
  updatedAt: true,
  branch: {
    select: { id: true, name: true, city: true, active: true },
  },
  product: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      active: true,
      category: { select: { id: true, name: true } },
    },
  },
  size: true,
  color: true,
} satisfies Prisma.InventorySelect;

export interface MovementMetadata {
  employeeId?: number;
  reference?: string;
  observation?: string;
}

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.inventory.findUnique({
      where: { id },
      select: inventorySelect,
    });
  }

  findByVariant(
    branchId: number,
    productId: number,
    sizeId: number,
    colorId: number,
  ) {
    return this.prisma.inventory.findUnique({
      where: {
        branchId_productId_sizeId_colorId: {
          branchId,
          productId,
          sizeId,
          colorId,
        },
      },
      select: inventorySelect,
    });
  }

  validateVariant(
    branchId: number,
    productId: number,
    sizeId: number,
    colorId: number,
  ) {
    return Promise.all([
      this.prisma.branch.count({ where: { id: branchId, active: true } }),
      this.prisma.product.count({
        where: {
          id: productId,
          active: true,
          sizes: { some: { sizeId } },
          colors: { some: { colorId } },
        },
      }),
    ]);
  }

  findEmployeeByUserId(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, branchId: true, active: true },
    });
  }

  async findAll(query: ListInventoryQueryDto) {
    const where: Prisma.InventoryWhereInput = {
      branchId: query.branchId,
      productId: query.productId,
      sizeId: query.sizeId,
      colorId: query.colorId,
      product: query.categoryId ? { categoryId: query.categoryId } : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        select: inventorySelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ branchId: 'asc' }, { productId: 'asc' }],
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { data, total };
  }

  async findAvailability(query: ListInventoryQueryDto) {
    const where: Prisma.InventoryWhereInput = {
      branchId: query.branchId,
      productId: query.productId,
      sizeId: query.sizeId,
      colorId: query.colorId,
      physicalQuantity: {
        gt: this.prisma.inventory.fields.reservedQuantity,
      },
      branch: { active: true },
      product: {
        active: true,
        categoryId: query.categoryId,
      },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        select: inventorySelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ branchId: 'asc' }, { productId: 'asc' }],
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { data, total };
  }

  registerEntry(
    variant: {
      branchId: number;
      productId: number;
      sizeId: number;
      colorId: number;
    },
    quantity: number,
    status: InventoryMovementStatus,
    scheduledAt: Date | undefined,
    metadata: MovementMetadata,
  ) {
    const completed = status === InventoryMovementStatus.COMPLETED;
    return this.prisma.$transaction(
      async (transaction) => {
        const inventory = await transaction.inventory.upsert({
          where: {
            branchId_productId_sizeId_colorId: variant,
          },
          update: completed
            ? { physicalQuantity: { increment: quantity } }
            : {},
          create: {
            ...variant,
            physicalQuantity: completed ? quantity : 0,
          },
        });
        const movement = await transaction.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            employeeId: metadata.employeeId,
            type: completed
              ? InventoryMovementType.ENTRY
              : InventoryMovementType.PENDING_ENTRY,
            quantity,
            status,
            scheduledAt,
            reference: metadata.reference,
            observation: metadata.observation,
          },
        });
        const updatedInventory = await transaction.inventory.findUniqueOrThrow({
          where: { id: inventory.id },
          select: inventorySelect,
        });
        return { inventory: updatedInventory, movement };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  adjustStock(
    inventoryId: number,
    physicalQuantity: number,
    previousQuantity: number,
    metadata: MovementMetadata,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const update = await transaction.inventory.updateMany({
          where: {
            id: inventoryId,
            physicalQuantity: previousQuantity,
            reservedQuantity: { lte: physicalQuantity },
          },
          data: { physicalQuantity },
        });
        if (update.count === 0) return null;

        const movement = await transaction.inventoryMovement.create({
          data: {
            inventoryId,
            employeeId: metadata.employeeId,
            type: InventoryMovementType.ADJUSTMENT,
            quantity: Math.abs(physicalQuantity - previousQuantity),
            status: InventoryMovementStatus.COMPLETED,
            reference: metadata.reference,
            observation: metadata.observation,
          },
        });
        const inventory = await transaction.inventory.findUniqueOrThrow({
          where: { id: inventoryId },
          select: inventorySelect,
        });
        return { inventory, movement };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  returnStock(
    inventoryId: number,
    quantity: number,
    metadata: MovementMetadata,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.inventory.update({
          where: { id: inventoryId },
          data: { physicalQuantity: { increment: quantity } },
        });
        const movement = await transaction.inventoryMovement.create({
          data: {
            inventoryId,
            employeeId: metadata.employeeId,
            type: InventoryMovementType.RETURN,
            quantity,
            status: InventoryMovementStatus.COMPLETED,
            reference: metadata.reference,
            observation: metadata.observation,
          },
        });
        const inventory = await transaction.inventory.findUniqueOrThrow({
          where: { id: inventoryId },
          select: inventorySelect,
        });
        return { inventory, movement };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findMovements(inventoryId: number, query: ListMovementsQueryDto) {
    const where: Prisma.InventoryMovementWhereInput = {
      inventoryId,
      type: query.type as InventoryMovementType | undefined,
      status: query.status as InventoryMovementStatus | undefined,
      occurredAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              jobTitle: true,
              user: { select: { name: true } },
            },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return { data, total };
  }

  findMovementForCompletion(movementId: number) {
    return this.prisma.inventoryMovement.findUnique({
      where: { id: movementId },
      include: { inventory: { select: { branchId: true } } },
    });
  }

  completePendingEntry(movementId: number) {
    return this.prisma.$transaction(
      async (transaction) => {
        const movement = await transaction.inventoryMovement.findUnique({
          where: { id: movementId },
        });
        if (
          !movement ||
          movement.type !== InventoryMovementType.PENDING_ENTRY ||
          movement.status !== InventoryMovementStatus.PENDING
        ) {
          return null;
        }

        await transaction.inventory.update({
          where: { id: movement.inventoryId },
          data: { physicalQuantity: { increment: movement.quantity } },
        });
        const completedMovement = await transaction.inventoryMovement.update({
          where: { id: movementId },
          data: {
            status: InventoryMovementStatus.COMPLETED,
            occurredAt: new Date(),
          },
        });
        const inventory = await transaction.inventory.findUniqueOrThrow({
          where: { id: movement.inventoryId },
          select: inventorySelect,
        });
        return { inventory, movement: completedMovement };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
