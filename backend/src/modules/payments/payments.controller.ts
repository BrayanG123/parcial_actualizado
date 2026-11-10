import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateStripeIntentDto } from './dto/create-stripe-intent.dto.js';
import { PosCardChargeDto, PosCardIntentDto } from './dto/pos-card.dto.js';
import { PaymentsService } from './payments.service.js';
import {
  AllowWhenReadOnly,
  RequiresFeature,
} from '../tenancy/plan.decorators.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('stripe/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @RequiresFeature('sales')
  @Header('Cache-Control', 'no-store')
  config() {
    return this.payments.config();
  }

  @Post('stripe/intents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @RequiresFeature('sales')
  @Header('Cache-Control', 'no-store')
  create(
    @Body() dto: CreateStripeIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.createIntent(dto.saleId, user);
  }

  /** Caja: autoriza el total del ticket con la tarjeta que se ingresa en el formulario. */
  @Post('pos/card-intents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  @RequiresFeature('sales')
  @Header('Cache-Control', 'no-store')
  createPosCardIntent(
    @Body() dto: PosCardIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.createPosCardIntent(dto, user);
  }

  /** Caja: registra la venta con el cobro autorizado y lo captura. */
  @Post('pos/card-charges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  @RequiresFeature('sales')
  @Header('Cache-Control', 'no-store')
  chargePosCard(
    @Body() dto: PosCardChargeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.chargePosCard(dto, user);
  }

  @Get('sales/:saleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER, Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  @RequiresFeature('sales')
  @Header('Cache-Control', 'no-store')
  status(
    @Param('saleId', ParseIntPipe) saleId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.status(saleId, user);
  }

  @Post('stripe/webhook')
  @HttpCode(200)
  @AllowWhenReadOnly()
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.payments.webhook(request.rawBody, signature);
  }
}
