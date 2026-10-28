import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';

export type PlanFeature =
  | 'products'
  | 'sales'
  | 'reservations'
  | 'offline'
  | 'conventionalReports'
  | 'aiReports'
  | 'mlAnalytics';

export type EffectiveSubscriptionStatus =
  'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'NONE';

export interface TenantAccess {
  tenantId: number;
  plan: {
    id: number;
    code: string;
    name: string;
    maxActiveBranches: number;
    features: Record<string, boolean>;
  } | null;
  subscription: {
    id: number;
    status: EffectiveSubscriptionStatus;
    startsAt: Date;
    endsAt: Date;
  } | null;
  /** Solo lectura: la suscripcion no esta vigente (decision del equipo, PLAN 3.2). */
  readOnly: boolean;
}

export const readOnlyError = (status: EffectiveSubscriptionStatus) =>
  new ForbiddenException({
    code: 'SUBSCRIPTION_READ_ONLY',
    message: `La suscripcion de la empresa no esta vigente (${status}): solo se permiten consultas`,
  });

/**
 * Plan, suscripcion y limites de la empresa actual. Los valores salen de la base
 * (tabla planes), por eso son configurables sin cambiar codigo.
 */
@Injectable()
export class SubscriptionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async forTenant(tenantId: number): Promise<TenantAccess> {
    return tenantContext.runAsSystem(async () => {
      let subscription = await this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
      if (
        subscription?.status === 'ACTIVE' &&
        subscription.endsAt.getTime() <= Date.now()
      ) {
        // CU07: el vencimiento se registra la primera vez que se detecta.
        const expired = await this.prisma.subscription.updateMany({
          where: { id: subscription.id, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        if (expired.count === 1)
          await this.prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: 'EXPIRE',
              fromPlanId: subscription.planId,
              toPlanId: subscription.planId,
              status: 'EXPIRED',
              startsAt: subscription.startsAt,
              endsAt: subscription.endsAt,
              note: 'Vencimiento automatico',
            },
          });
        subscription = { ...subscription, status: 'EXPIRED' };
      }
      const status: EffectiveSubscriptionStatus =
        subscription?.status ?? 'NONE';
      return {
        tenantId,
        plan: subscription
          ? {
              id: subscription.plan.id,
              code: subscription.plan.code,
              name: subscription.plan.name,
              maxActiveBranches: subscription.plan.maxActiveBranches,
              features: normalizeFeatures(subscription.plan.features),
            }
          : null,
        subscription: subscription
          ? {
              id: subscription.id,
              status,
              startsAt: subscription.startsAt,
              endsAt: subscription.endsAt,
            }
          : null,
        readOnly: status !== 'ACTIVE',
      };
    });
  }

  current(): Promise<TenantAccess> {
    return this.forTenant(tenantContext.requireTenantId());
  }

  async assertFeature(feature: PlanFeature): Promise<void> {
    const access = await this.current();
    if (!access.plan?.features[feature])
      throw new ForbiddenException({
        code: 'PLAN_FEATURE_REQUIRED',
        message: `El plan ${access.plan?.name ?? 'actual'} no incluye esta funcionalidad (${feature})`,
      });
  }

  async assertWritable(): Promise<void> {
    const access = await this.current();
    if (access.readOnly)
      throw readOnlyError(access.subscription?.status ?? 'NONE');
  }

  /** Limite de sucursales activas del plan (crear o reactivar una sucursal). */
  async assertCanActivateBranch(): Promise<void> {
    const access = await this.current();
    const max = access.plan?.maxActiveBranches ?? 0;
    const active = await this.prisma.branch.count({ where: { active: true } });
    if (active >= max)
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_REACHED',
        message: `El plan ${access.plan?.name ?? 'actual'} permite hasta ${max} sucursales activas`,
      });
  }
}

export function normalizeFeatures(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, enabled]) => [key, enabled === true]),
  );
}
