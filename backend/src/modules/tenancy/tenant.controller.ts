import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { UpdateTenantSettingsDto } from '../exchanges/dto/exchange.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { TENANT_ROLES } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { TenantsService } from './tenants.service.js';

/** Informacion de la empresa actual (F2.8): publica para la tienda y privada para el personal. */
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly access: SubscriptionAccessService,
    private readonly prisma: PrismaService,
  ) {}

  /** Directorio publico de empresas activas para el selector de tiendas. */
  @Get('directory')
  directory() {
    return this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Empresa resuelta por X-Tenant (o la empresa por defecto). */
  @Get('public')
  async publicInfo() {
    const tenant = await this.tenants.findById(tenantContext.requireTenantId());
    return tenant && { id: tenant.id, slug: tenant.slug, name: tenant.name };
  }

  /** Configuracion propia de la empresa (plazo de cambio de prendas). */
  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...TENANT_ROLES)
  async settings() {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantContext.requireTenantId() },
      select: { exchangeWindowDays: true },
    });
    return tenant;
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  async updateSettings(@Body() dto: UpdateTenantSettingsDto) {
    return this.prisma.tenant.update({
      where: { id: tenantContext.requireTenantId() },
      data: { exchangeWindowDays: dto.exchangeWindowDays },
      select: { exchangeWindowDays: true },
    });
  }

  /** Plan, limites, uso y vencimiento de la empresa del usuario autenticado. */
  @Get('subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...TENANT_ROLES)
  async subscription() {
    const access = await this.access.current();
    const tenant = await this.tenants.findById(access.tenantId);
    const [activeBranches, branches, users] = await Promise.all([
      this.prisma.branch.count({ where: { active: true } }),
      this.prisma.branch.count(),
      this.prisma.user.count(),
    ]);
    const endsAt = access.subscription?.endsAt;
    return {
      tenant: tenant && { id: tenant.id, slug: tenant.slug, name: tenant.name },
      plan: access.plan,
      subscription: access.subscription && {
        ...access.subscription,
        daysRemaining: endsAt
          ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000))
          : 0,
      },
      readOnly: access.readOnly,
      usage: {
        activeBranches,
        branches,
        users,
        remainingBranches: Math.max(
          0,
          (access.plan?.maxActiveBranches ?? 0) - activeBranches,
        ),
      },
    };
  }
}
