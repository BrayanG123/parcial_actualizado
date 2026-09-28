import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OfflineSalesService } from './offline-sales.service.js';
import {
  PrepareOfflineDto,
  OfflineSaleDto,
  FinishOfflineDto,
} from './dto/offline.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  CheckoutDto,
  CheckoutPreviewDto,
  DeliverSaleDto,
} from './dto/checkout.dto.js';
import { CreateInStoreSaleDto } from './dto/create-in-store-sale.dto.js';
import { ListSalesQueryDto } from './dto/list-sales-query.dto.js';
import { SalesService } from './sales.service.js';
import {
  InStoreSelectionDto,
  PosBranchQueryDto,
  SearchPosCustomersDto,
} from './dto/in-store-selection.dto.js';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER, Role.CUSTOMER)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly offline: OfflineSalesService,
  ) {}

  @Post('offline/prepare')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  prepareOffline(
    @Body() dto: PrepareOfflineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offline.prepare(dto, user);
  }

  @Post('offline/:id/sales')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  syncOffline(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: OfflineSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offline.sync(id, dto, user);
  }

  @Post('offline/:id/finish')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  finishOffline(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: FinishOfflineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offline.finish(id, dto, user);
  }

  @Post('in-store/preview')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  previewInStore(
    @Body() dto: InStoreSelectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.previewInStore(dto, user);
  }

  @Get('in-store/customers')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  customers(
    @Query() dto: SearchPosCustomersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.searchPosCustomers(dto, user);
  }

  @Get('in-store/reservations/:id')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  reservation(
    @Param('id', ParseIntPipe) id: number,
    @Query() dto: PosBranchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.posReservation(id, dto.branchId, user);
  }

  @Post('in-store')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  createInStore(
    @Body() dto: CreateInStoreSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.createInStore(dto, user);
  }

  @Post('checkout/preview')
  @Roles(Role.CUSTOMER)
  preview(
    @Body() dto: CheckoutPreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.previewCheckout(dto, user);
  }

  @Post('checkout')
  @Roles(Role.CUSTOMER)
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.checkout(dto, user);
  }

  @Get('mine')
  @Roles(Role.CUSTOMER)
  findMine(
    @Query() query: ListSalesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findMine(query, user);
  }

  @Get()
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  findAll(
    @Query() query: ListSalesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findAll(query, user);
  }

  @Get(':id/receipt')
  receipt(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.receipt(id, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findOne(id, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.cancel(id, user);
  }

  @Post(':id/deliver')
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  deliver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeliverSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.deliver(id, dto, user);
  }
}
