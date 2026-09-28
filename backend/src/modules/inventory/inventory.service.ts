import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto.js';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto.js';
import { InventoryRepository } from './inventory.repository.js';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async findAvailability(query: ListInventoryQueryDto) {
    const result = await this.inventoryRepository.findAvailability(query);
    return {
      data: result.data.map((inventory) => ({
        id: inventory.id,
        branch: inventory.branch,
        product: inventory.product,
        size: inventory.size,
        color: inventory.color,
        availableQuantity:
          inventory.physicalQuantity - inventory.reservedQuantity,
        updatedAt: inventory.updatedAt,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findAll(query: ListInventoryQueryDto, user: AuthenticatedUser) {
    const scopedQuery = await this.scopeQuery(query, user);
    const result = await this.inventoryRepository.findAll(scopedQuery);
    return this.paginated(result, scopedQuery);
  }

  async findOne(id: number, user: AuthenticatedUser) {
    const inventory = await this.getInventory(id);
    await this.assertBranchAccess(user, inventory.branch.id);
    return this.present(inventory);
  }

  async findMovements(
    id: number,
    query: ListMovementsQueryDto,
    user: AuthenticatedUser,
  ) {
    const inventory = await this.getInventory(id);
    await this.assertBranchAccess(user, inventory.branch.id);
    const result = await this.inventoryRepository.findMovements(id, query);
    return {
      data: result.data,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  private async getInventory(id: number) {
    const inventory = await this.inventoryRepository.findById(id);
    if (!inventory) {
      throw new NotFoundException(`Inventory ${id} was not found`);
    }
    return inventory;
  }

  private async scopeQuery(
    query: ListInventoryQueryDto,
    user: AuthenticatedUser,
  ): Promise<ListInventoryQueryDto> {
    if (user.roles.includes(Role.ADMINISTRATOR)) return query;
    const employee = await this.inventoryRepository.findEmployeeByUserId(
      user.id,
    );
    if (!employee?.active || !user.roles.includes(Role.BRANCH_MANAGER)) {
      throw new ForbiddenException('You cannot access internal inventory');
    }
    if (query.branchId && query.branchId !== employee.branchId) {
      throw new ForbiddenException('You can only access your assigned branch');
    }
    return Object.assign(new ListInventoryQueryDto(), query, {
      branchId: employee.branchId,
    });
  }

  private async assertBranchAccess(
    user: AuthenticatedUser,
    branchId: number,
  ): Promise<void> {
    if (user.roles.includes(Role.ADMINISTRATOR)) return;
    const employee = await this.inventoryRepository.findEmployeeByUserId(
      user.id,
    );
    if (
      !employee?.active ||
      employee.branchId !== branchId ||
      !user.roles.includes(Role.BRANCH_MANAGER)
    ) {
      throw new ForbiddenException('You can only access your assigned branch');
    }
  }

  private paginated<
    T extends {
      physicalQuantity: number;
      reservedQuantity: number;
    },
  >(result: { data: T[]; total: number }, query: ListInventoryQueryDto) {
    return {
      data: result.data.map((inventory) => this.present(inventory)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  private present<
    T extends {
      physicalQuantity: number;
      reservedQuantity: number;
    },
  >(inventory: T) {
    return {
      ...inventory,
      availableQuantity:
        inventory.physicalQuantity - inventory.reservedQuantity,
    };
  }
}
