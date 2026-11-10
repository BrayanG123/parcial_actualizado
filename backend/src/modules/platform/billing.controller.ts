import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { AllowWhenReadOnly } from '../tenancy/plan.decorators.js';
import { ChangeOwnPlanDto, RenewOwnPlanDto } from './dto/billing.dto.js';
import { PlatformService } from './platform.service.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';

/**
 * Plan de la propia empresa: el administrador (o el dueño al entrar a su empresa) cambia
 * de plan o renueva pagando con Stripe. Disponible aun con la suscripcion vencida
 * (solo lectura), porque es la forma de reactivarla.
 */
@Controller('billing')
@AllowWhenReadOnly()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR)
export class BillingController {
  constructor(
    private readonly billing: SubscriptionBillingService,
    private readonly platform: PlatformService,
  ) {}

  @Get('plans')
  plans() {
    return this.platform.publicPlans();
  }

  @Get('payments')
  payments() {
    return this.billing.tenantPayments(tenantContext.requireTenantId());
  }

  @Post('subscription/change')
  change(@Body() dto: ChangeOwnPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.changePlan(
      tenantContext.requireTenantId(),
      user.id,
      dto.planCode,
    );
  }

  @Post('subscription/renew')
  renew(@Body() dto: RenewOwnPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.renew(tenantContext.requireTenantId(), user.id, dto.months);
  }

  @Post('payments/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.billing.confirm(id);
  }
}
