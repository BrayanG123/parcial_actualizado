import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto.js';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto.js';
import { ReturnStockDto } from './dto/return-stock.dto.js';
import { StockEntryDto } from './dto/stock-entry.dto.js';
import { InventoryService } from './inventory.service.js';
import { MovementsService } from './movements.service.js';

const InventoryManagers = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER),
  );

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly movementsService: MovementsService,
  ) {}

  @Get('availability')
  findAvailability(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.findAvailability(query);
  }

  @Get()
  @InventoryManagers()
  findAll(
    @Query() query: ListInventoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.findAll(query, user);
  }

  @Get(':id/movements')
  @InventoryManagers()
  findMovements(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListMovementsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.findMovements(id, query, user);
  }

  @Get(':id')
  @InventoryManagers()
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.findOne(id, user);
  }

  @Post('entries')
  @InventoryManagers()
  registerEntry(
    @Body() dto: StockEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementsService.registerEntry(dto, user);
  }

  @Post('movements/:movementId/complete')
  @InventoryManagers()
  completePendingEntry(
    @Param('movementId', ParseIntPipe) movementId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementsService.completePendingEntry(movementId, user);
  }

  @Post(':id/adjustments')
  @InventoryManagers()
  adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementsService.adjust(id, dto, user);
  }

  @Post(':id/returns')
  @InventoryManagers()
  registerReturn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.movementsService.registerReturn(id, dto, user);
  }
}
