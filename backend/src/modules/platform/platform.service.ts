import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma, SubscriptionAction } from '../../generated/prisma/client.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { TenantsService } from '../tenancy/tenants.service.js';
import { normalizeFeatures } from '../tenancy/subscription-access.service.js';
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

/** Codigos que chocarian con rutas de la web o de la API. */
const RESERVED_SLUGS = new Set(['platform', 'api', 'admin', 't', 'www']);

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

const tenantInclude = {
  subscription: { include: { plan: true } },
} satisfies Prisma.TenantInclude;

/**
 * Administracion de la plataforma SaaS (rol PLATFORM_ADMIN). Opera sobre todas las
 * empresas, por eso cada metodo corre con `runAsSystem` y escribe `tenantId`
 * explicito en las tablas de negocio.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly config: ConfigService,
  ) {}

  private get saltRounds() {
    return this.config.get<number>('app.passwordSaltRounds') ?? 12;
  }

  listPlans() {
    return tenantContext.runAsSystem(() =>
      this.prisma.plan.findMany({ orderBy: { maxActiveBranches: 'asc' } }),
    );
  }

  createPlan(dto: CreatePlanDto) {
    return tenantContext.runAsSystem(async () => {
      if (await this.prisma.plan.findUnique({ where: { code: dto.code } }))
        throw new ConflictException('Ya existe un plan con ese codigo');
      return this.prisma.plan.create({
        data: { ...dto, features: normalizeFeatures(dto.features ?? {}) },
      });
    });
  }

  updatePlan(id: number, dto: UpdatePlanDto) {
    return tenantContext.runAsSystem(async () => {
      await this.findPlan(id);
      return this.prisma.plan.update({
        where: { id },
        data: {
          ...dto,
          features: dto.features ? normalizeFeatures(dto.features) : undefined,
        },
      });
    });
  }

  listTenants() {
    return tenantContext.runAsSystem(async () => {
      const tenants = await this.prisma.tenant.findMany({
        include: tenantInclude,
        orderBy: { id: 'asc' },
      });
      return Promise.all(tenants.map((tenant) => this.withUsage(tenant)));
    });
  }

  getTenant(id: number) {
    return tenantContext.runAsSystem(async () =>
      this.withUsage(await this.findTenant(id)),
    );
  }

  /** CU01: empresa + suscripcion + historial + administrador, en una transaccion. */
  createTenant(dto: CreateTenantDto, performedById: number) {
    if (RESERVED_SLUGS.has(dto.slug))
      throw new BadRequestException('El codigo de empresa esta reservado');
    return tenantContext.runAsSystem(async () => {
      if (await this.prisma.tenant.findUnique({ where: { slug: dto.slug } }))
        throw new ConflictException('El codigo de empresa ya existe');
      const plan = await this.findActivePlan(dto.planCode);
      const adminRole = await this.prisma.role.findUnique({
        where: { name: 'ADMINISTRATOR' },
      });
      if (!adminRole)
        throw new BadRequestException(
          'Database roles are not initialized; execute the seed first',
        );
      const passwordHash = await hash(dto.admin.password, this.saltRounds);
      const startsAt = new Date();
      const endsAt = addMonths(startsAt, dto.months ?? 12);
      const tenant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            subscription: {
              create: {
                planId: plan.id,
                startsAt,
                endsAt,
                history: {
                  create: {
                    action: 'ASSIGN',
                    toPlanId: plan.id,
                    status: 'ACTIVE',
                    startsAt,
                    endsAt,
                    performedById,
                  },
                },
              },
            },
          },
        });
        await tx.user.create({
          data: {
            tenantId: created.id,
            name: dto.admin.name,
            email: dto.admin.email,
            passwordHash,
            roles: { create: { roleId: adminRole.id } },
          },
        });
        return created;
      });
      this.tenants.invalidate();
      return this.getTenant(tenant.id);
    });
  }

  updateTenant(id: number, dto: UpdateTenantDto) {
    return tenantContext.runAsSystem(async () => {
      await this.findTenant(id);
      await this.prisma.tenant.update({ where: { id }, data: dto });
      this.tenants.invalidate();
      return this.getTenant(id);
    });
  }

  /** CU02: designa un (nuevo) administrador de la empresa. */
  addTenantAdmin(id: number, dto: TenantAdminDto) {
    return tenantContext.runAsSystem(async () => {
      await this.findTenant(id);
      if (
        await this.prisma.user.findFirst({
          where: { tenantId: id, email: dto.email },
        })
      )
        throw new ConflictException('Email is already registered');
      const role = await this.prisma.role.findUniqueOrThrow({
        where: { name: 'ADMINISTRATOR' },
      });
      return this.prisma.user.create({
        data: {
          tenantId: id,
          name: dto.name,
          email: dto.email,
          passwordHash: await hash(dto.password, this.saltRounds),
          roles: { create: { roleId: role.id } },
        },
        select: { id: true, name: true, email: true, tenantId: true },
      });
    });
  }

  /** CU03: cambio de plan verificando que el uso actual quepa en el nuevo limite. */
  changePlan(id: number, dto: ChangePlanDto, performedById: number) {
    return tenantContext.runAsSystem(async () => {
      const subscription = await this.findSubscription(id);
      const plan = await this.findActivePlan(dto.planCode);
      const activeBranches = await this.prisma.branch.count({
        where: { tenantId: id, active: true },
      });
      if (activeBranches > plan.maxActiveBranches)
        throw new ConflictException({
          code: 'PLAN_LIMIT_EXCEEDED',
          message: `La empresa tiene ${activeBranches} sucursales activas y el plan ${plan.name} permite ${plan.maxActiveBranches}; desactive ${activeBranches - plan.maxActiveBranches} antes de cambiar`,
        });
      await this.record(subscription, 'CHANGE_PLAN', performedById, dto.note, {
        planId: plan.id,
      });
      return this.getTenant(id);
    });
  }

  /** CU04: renovacion simulada (sin cobro). Extiende desde el vencimiento o desde hoy. */
  renew(id: number, dto: RenewSubscriptionDto, performedById: number) {
    return tenantContext.runAsSystem(async () => {
      const subscription = await this.findSubscription(id);
      const now = new Date();
      const base =
        subscription.endsAt > now && subscription.status === 'ACTIVE'
          ? subscription.endsAt
          : now;
      await this.record(subscription, 'RENEW', performedById, dto.note, {
        status: 'ACTIVE',
        startsAt: subscription.endsAt > now ? subscription.startsAt : now,
        endsAt: addMonths(base, dto.months),
      });
      return this.getTenant(id);
    });
  }

  suspend(id: number, dto: SubscriptionNoteDto, performedById: number) {
    return tenantContext.runAsSystem(async () => {
      const subscription = await this.findSubscription(id);
      await this.record(subscription, 'SUSPEND', performedById, dto.note, {
        status: 'SUSPENDED',
      });
      return this.getTenant(id);
    });
  }

  reactivate(id: number, dto: SubscriptionNoteDto, performedById: number) {
    return tenantContext.runAsSystem(async () => {
      const subscription = await this.findSubscription(id);
      if (subscription.endsAt <= new Date())
        throw new ConflictException(
          'La suscripcion esta vencida: renuevela en lugar de reactivarla',
        );
      await this.record(subscription, 'REACTIVATE', performedById, dto.note, {
        status: 'ACTIVE',
      });
      return this.getTenant(id);
    });
  }

  history(id: number) {
    return tenantContext.runAsSystem(async () => {
      const subscription = await this.findSubscription(id);
      return this.prisma.subscriptionHistory.findMany({
        where: { subscriptionId: subscription.id },
        include: {
          fromPlan: { select: { code: true, name: true } },
          toPlan: { select: { code: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });
  }

  private async record(
    subscription: { id: number; planId: number; startsAt: Date; endsAt: Date },
    action: SubscriptionAction,
    performedById: number,
    note: string | undefined,
    changes: Prisma.SubscriptionUncheckedUpdateInput & {
      planId?: number;
      status?: 'ACTIVE' | 'SUSPENDED';
      startsAt?: Date;
      endsAt?: Date;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: changes,
      });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          action,
          fromPlanId: subscription.planId,
          toPlanId: updated.planId,
          status: updated.status,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
          note,
          performedById,
        },
      });
    });
  }

  private async withUsage(
    tenant: Prisma.TenantGetPayload<{ include: typeof tenantInclude }>,
  ) {
    const [activeBranches, branches, users] = await Promise.all([
      this.prisma.branch.count({
        where: { tenantId: tenant.id, active: true },
      }),
      this.prisma.branch.count({ where: { tenantId: tenant.id } }),
      this.prisma.user.count({ where: { tenantId: tenant.id } }),
    ]);
    return { ...tenant, usage: { activeBranches, branches, users } };
  }

  private async findTenant(id: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: tenantInclude,
    });
    if (!tenant) throw new NotFoundException(`Tenant ${id} was not found`);
    return tenant;
  }

  private async findSubscription(tenantId: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });
    if (!subscription)
      throw new NotFoundException(`Tenant ${tenantId} has no subscription`);
    return subscription;
  }

  private async findPlan(id: number) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} was not found`);
    return plan;
  }

  private async findActivePlan(code: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!plan || !plan.active)
      throw new BadRequestException('El plan no existe o esta inactivo');
    return plan;
  }
}
