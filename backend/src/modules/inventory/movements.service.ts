import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { InventoryMovementStatus as CommonMovementStatus } from '../../common/enums/inventory-movement.enum.js';
import { Role } from '../../common/enums/role.enum.js';
import { InventoryMovementStatus } from '../../generated/prisma/client.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ReturnStockDto } from './dto/return-stock.dto.js';
import { StockEntryDto } from './dto/stock-entry.dto.js';
import { InventoryRepository } from './inventory.repository.js';

@Injectable()
export class MovementsService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async registerEntry(dto: StockEntryDto, user: AuthenticatedUser) {
    if (dto.status === CommonMovementStatus.CANCELLED) {
      throw new BadRequestException('A new stock entry cannot be cancelled');
    }
    if (dto.status === CommonMovementStatus.PENDING && !dto.scheduledAt) {
      throw new BadRequestException(
        'scheduledAt is required for pending entries',
      );
    }
    if (
      dto.scheduledAt &&
      dto.status === CommonMovementStatus.PENDING &&
      new Date(dto.scheduledAt) <= new Date()
    ) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    const [branchCount, productCount] =
      await this.inventoryRepository.validateVariant(
        dto.branchId,
        dto.productId,
        dto.sizeId,
        dto.colorId,
      );
    if (!branchCount) {
      throw new BadRequestException('Branch does not exist or is inactive');
    }
    if (!productCount) {
      throw new BadRequestException(
        'Product, size or color is invalid for this variant',
      );
    }

    const employeeId = await this.authorizeMovement(user, dto.branchId);
    return this.inventoryRepository.registerEntry(
      {
        branchId: dto.branchId,
        productId: dto.productId,
        sizeId: dto.sizeId,
        colorId: dto.colorId,
      },
      dto.quantity,
      dto.status as unknown as InventoryMovementStatus,
      dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      {
        employeeId,
        reference: dto.reference,
        observation: dto.observation,
      },
    );
  }

  async adjust(
    inventoryId: number,
    dto: AdjustStockDto,
    user: AuthenticatedUser,
  ) {
    const inventory = await this.getInventory(inventoryId);
    const employeeId = await this.authorizeMovement(user, inventory.branch.id);
    if (dto.physicalQuantity === inventory.physicalQuantity) {
      throw new BadRequestException('The new quantity must be different');
    }
    if (dto.physicalQuantity < inventory.reservedQuantity) {
      throw new BadRequestException(
        'Physical quantity cannot be lower than reserved quantity',
      );
    }

    const result = await this.inventoryRepository.adjustStock(
      inventoryId,
      dto.physicalQuantity,
      inventory.physicalQuantity,
      {
        employeeId,
        reference: dto.reference,
        observation: dto.observation,
      },
    );
    if (!result) {
      throw new BadRequestException(
        'Inventory changed concurrently; retry the operation',
      );
    }
    return result;
  }

  async registerReturn(
    inventoryId: number,
    dto: ReturnStockDto,
    user: AuthenticatedUser,
  ) {
    const inventory = await this.getInventory(inventoryId);
    const employeeId = await this.authorizeMovement(user, inventory.branch.id);
    return this.inventoryRepository.returnStock(inventoryId, dto.quantity, {
      employeeId,
      reference: dto.reference,
      observation: dto.observation,
    });
  }

  async completePendingEntry(movementId: number, user: AuthenticatedUser) {
    const movement =
      await this.inventoryRepository.findMovementForCompletion(movementId);
    if (!movement) {
      throw new NotFoundException(`Movement ${movementId} was not found`);
    }
    if (
      movement.status !== InventoryMovementStatus.PENDING ||
      movement.type !== 'PENDING_ENTRY'
    ) {
      throw new BadRequestException('Movement is not a pending stock entry');
    }
    await this.authorizeMovement(user, movement.inventory.branchId);

    const result =
      await this.inventoryRepository.completePendingEntry(movementId);
    if (!result) {
      throw new BadRequestException(
        'Movement changed concurrently or is no longer pending',
      );
    }
    return result;
  }

  private async getInventory(id: number) {
    const inventory = await this.inventoryRepository.findById(id);
    if (!inventory) {
      throw new NotFoundException(`Inventory ${id} was not found`);
    }
    return inventory;
  }

  private async authorizeMovement(
    user: AuthenticatedUser,
    branchId: number,
  ): Promise<number | undefined> {
    const employee = await this.inventoryRepository.findEmployeeByUserId(
      user.id,
    );
    if (user.roles.includes(Role.ADMINISTRATOR)) {
      return employee?.active && employee.branchId === branchId
        ? employee.id
        : undefined;
    }
    if (
      !user.roles.includes(Role.BRANCH_MANAGER) ||
      !employee?.active ||
      employee.branchId !== branchId
    ) {
      throw new ForbiddenException(
        'You can only register movements in your assigned branch',
      );
    }
    return employee.id;
  }
}
