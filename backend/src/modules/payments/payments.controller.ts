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
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('stripe/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Header('Cache-Control', 'no-store')
  config() {
    return this.payments.config();
  }

  @Post('stripe/intents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Header('Cache-Control', 'no-store')
  create(
    @Body() dto: CreateStripeIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.createIntent(dto.saleId, user);
  }

  @Get('sales/:saleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER, Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
  @Header('Cache-Control', 'no-store')
  status(
    @Param('saleId', ParseIntPipe) saleId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.status(saleId, user);
  }

  @Post('stripe/webhook')
  @HttpCode(200)
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.payments.webhook(request.rawBody, signature);
  }
}
