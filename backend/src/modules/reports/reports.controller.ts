import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  CashShiftsReportQueryDto,
  InventoryReportQueryDto,
  PeriodReportQueryDto,
  SalesReportQueryDto,
  TopProductsQueryDto,
} from './dto/report-query.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('sales')
  sales(
    @Query() query: SalesReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.sales(query, user);
  }
  @Get('top-products')
  topProducts(
    @Query() query: TopProductsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.topProducts(query, user);
  }
  @Get('inventory')
  inventory(
    @Query() query: InventoryReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.inventory(query, user);
  }
  @Get('cash-shifts')
  cashShifts(
    @Query() query: CashShiftsReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.cashShifts(query, user);
  }
  @Get('reservations')
  reservations(
    @Query() query: PeriodReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.reservations(query, user);
  }
}
