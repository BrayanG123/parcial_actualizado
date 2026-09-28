import {
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
import { PosBranchQueryDto } from '../sales/dto/in-store-selection.dto.js';
import {
  CloseShiftDto,
  CreateRegisterDto,
  ListShiftsDto,
  OpenShiftDto,
} from './cash.dto.js';
import { CashService } from './cash.service.js';

@Controller('cash')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
export class CashController {
  constructor(private readonly cash: CashService) {}
  @Get('registers') registers(
    @Query() dto: PosBranchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.registers(dto.branchId, user);
  }
  @Post('registers')
  @Roles(Role.ADMINISTRATOR)
  create(
    @Body() dto: CreateRegisterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.createRegister(dto, user);
  }
  @Get('shifts/current') current(@CurrentUser() user: AuthenticatedUser) {
    return this.cash.current(user);
  }
  @Get('shifts') list(
    @Query() dto: ListShiftsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.list(dto, user);
  }
  @Post('shifts') open(
    @Body() dto: OpenShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.open(dto, user);
  }
  @Post('shifts/:id/close') close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.close(id, dto, user);
  }
}
