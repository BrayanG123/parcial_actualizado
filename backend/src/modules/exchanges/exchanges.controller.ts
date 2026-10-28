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
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RequiresFeature } from '../tenancy/plan.decorators.js';
import { CreateExchangeDto, RedeemCreditNoteDto } from './dto/exchange.dto.js';
import { ExchangesService } from './exchanges.service.js';

@Controller()
@RequiresFeature('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
export class ExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  /** Lineas cambiables, plazo y prendas candidatas de la sucursal. */
  @Get('exchanges/sales/:saleId')
  options(
    @Param('saleId', ParseIntPipe) saleId: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.exchanges.options(
      saleId,
      user,
      branchId ? Number(branchId) : undefined,
    );
  }

  @Post('exchanges')
  create(
    @Body() dto: CreateExchangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exchanges.create(dto, user);
  }

  @Get('exchanges')
  list(@Query('saleId') saleId?: string) {
    return this.exchanges.list(saleId ? Number(saleId) : undefined);
  }

  @Get('credit-notes/:code')
  creditNote(@Param('code') code: string) {
    return this.exchanges.creditNote(code);
  }

  @Post('credit-notes/:code/redeem')
  redeem(@Param('code') code: string, @Body() dto: RedeemCreditNoteDto) {
    return this.exchanges.redeem(code, dto.amount);
  }
}
