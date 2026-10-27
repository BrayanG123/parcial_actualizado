import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { AllowWhenReadOnly } from '../tenancy/plan.decorators.js';
import {
  ChangePlanDto,
  CreatePlanDto,
  CreateTenantDto,
  RenewSubscriptionDto,
  SubscriptionNoteDto,
  TenantAdminDto,
  UpdatePlanDto,
  UpdateTenantDto,
} from './dto/platform.dto.js';
import { PlatformService } from './platform.service.js';

/** Login del administrador de la plataforma SaaS (sin empresa). */
@Controller('platform/auth')
@AllowWhenReadOnly()
export class PlatformAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.platformLogin(dto);
  }
}

@Controller('platform')
@AllowWhenReadOnly()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('plans')
  listPlans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.platform.createPlan(dto);
  }

  /** Limites y funcionalidades configurables (enunciado 9.4). */
  @Patch('plans/:id')
  updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.platform.updatePlan(id, dto);
  }

  @Get('tenants')
  listTenants() {
    return this.platform.listTenants();
  }

  @Post('tenants')
  createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.platform.createTenant(dto, userId);
  }

  @Get('tenants/:id')
  getTenant(@Param('id', ParseIntPipe) id: number) {
    return this.platform.getTenant(id);
  }

  @Patch('tenants/:id')
  updateTenant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.platform.updateTenant(id, dto);
  }

  @Post('tenants/:id/admins')
  addAdmin(@Param('id', ParseIntPipe) id: number, @Body() dto: TenantAdminDto) {
    return this.platform.addTenantAdmin(id, dto);
  }

  @Get('tenants/:id/subscription/history')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.platform.history(id);
  }

  @Patch('tenants/:id/subscription/plan')
  changePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePlanDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.platform.changePlan(id, dto, userId);
  }

  @Post('tenants/:id/subscription/renew')
  @HttpCode(200)
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewSubscriptionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.platform.renew(id, dto, userId);
  }

  @Post('tenants/:id/subscription/suspend')
  @HttpCode(200)
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubscriptionNoteDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.platform.suspend(id, dto, userId);
  }

  @Post('tenants/:id/subscription/reactivate')
  @HttpCode(200)
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubscriptionNoteDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.platform.reactivate(id, dto, userId);
  }
}
