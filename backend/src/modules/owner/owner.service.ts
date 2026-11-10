import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcrypt';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { PlatformService } from '../platform/platform.service.js';
import { SubscriptionBillingService } from '../platform/subscription-billing.service.js';
import type { OwnerCreateTenantDto } from './dto/owner.dto.js';
import type { OwnerJwtPayload } from './owner-jwt.guard.js';

const STAFF_ROLES = ['ADMINISTRATOR', 'BRANCH_MANAGER', 'CASHIER'] as const;
const OPEN_RESERVATIONS = ['PENDING', 'PREPARING', 'READY'] as const;

/** Inicio del mes actual en Bolivia (UTC-4, sin horario de verano). */
function startOfMonthInBolivia(now = new Date()) {
  const local = new Date(now.getTime() - 4 * 3600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 4, 0, 0),
  );
}

/**
 * F14: un dueño (cuenta global) con varias empresas. Cada empresa conserva su aislamiento:
 * las estadisticas se calculan dentro de cada empresa y, para operar, el dueño recibe la
 * sesion del administrador de esa empresa vinculado a su cuenta.
 */
@Injectable()
export class OwnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly platform: PlatformService,
    private readonly billing: SubscriptionBillingService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const account = await tenantContext.runAsSystem(() =>
      this.prisma.ownerAccount.findUnique({ where: { email: dto.email } }),
    );
    const valid = account
      ? await compare(dto.password, account.passwordHash)
      : false;
    if (!account || !account.active || !valid)
      throw new UnauthorizedException('Invalid email or password');
    const payload: OwnerJwtPayload = {
      sub: account.id,
      email: account.email,
      kind: 'owner',
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer' as const,
      account: { id: account.id, name: account.name, email: account.email },
    };
  }

  /** Empresas del dueño con datos basicos para elegir a cual entrar. */
  async tenants(accountId: number) {
    const admins = await tenantContext.runAsSystem(() =>
      this.prisma.user.findMany({
        where: {
          ownerAccountId: accountId,
          active: true,
          tenantId: { not: null },
          roles: { some: { role: { name: 'ADMINISTRATOR' } } },
        },
        select: {
          tenant: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              subscription: {
                select: {
                  status: true,
                  startsAt: true,
                  endsAt: true,
                  plan: {
                    select: {
                      code: true,
                      name: true,
                      monthlyPrice: true,
                      maxActiveBranches: true,
                      features: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    const tenants = [
      ...new Map(
        admins
          .map((a) => a.tenant)
          .filter((t): t is NonNullable<typeof t> => t !== null)
          .map((t) => [t.id, t]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const monthStart = startOfMonthInBolivia();
    const now = new Date();
    return Promise.all(
      tenants.map(async (tenant) => {
        const stats = await tenantContext.runInTenant(tenant.id, async () => {
          const [
            branches,
            activeBranches,
            staff,
            customers,
            products,
            sales,
            reservations,
          ] = await Promise.all([
            this.prisma.branch.count(),
            this.prisma.branch.count({ where: { active: true } }),
            this.prisma.user.count({
              where: {
                active: true,
                roles: { some: { role: { name: { in: [...STAFF_ROLES] } } } },
              },
            }),
            this.prisma.client.count(),
            this.prisma.product.count({ where: { active: true } }),
            this.prisma.sale.aggregate({
              where: { status: 'COMPLETED', confirmedAt: { gte: monthStart } },
              _count: { _all: true },
              _sum: { total: true },
            }),
            this.prisma.reservation.count({
              where: { status: { in: [...OPEN_RESERVATIONS] } },
            }),
          ]);
          return {
            branches,
            activeBranches,
            staff,
            customers,
            products,
            openReservations: reservations,
            salesThisMonth: {
              count: sales._count._all,
              total: Number(sales._sum.total ?? 0),
              currency: this.config.get<string>('SALES_CURRENCY') ?? 'BOB',
            },
          };
        });
        const subscription = tenant.subscription;
        return {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          subscription: subscription && {
            status: subscription.status,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
            readOnly:
              subscription.status !== 'ACTIVE' || subscription.endsAt <= now,
            plan: {
              ...subscription.plan,
              monthlyPrice: Number(subscription.plan.monthlyPrice),
            },
          },
          stats,
        };
      }),
    );
  }

  /** Otra empresa con su plan (pago simulado, 1 mes); el dueño queda como administrador. */
  /** Empresa adicional: el plan gratuito se crea al instante; uno de pago, al confirmar Stripe. */
  createTenant(accountId: number, dto: OwnerCreateTenantDto) {
    return this.billing.ownerTenant(accountId, dto, () =>
      this.createFreeTenant(accountId, dto),
    );
  }

  private async createFreeTenant(accountId: number, dto: OwnerCreateTenantDto) {
    const tenant = await this.platform.createTenant(
      {
        ...dto,
        months: 1,
        // Sin uso: el administrador toma nombre, correo y contraseña de la cuenta del dueño.
        admin: { name: '-', email: '-', password: '-' },
      },
      null,
      { accountId },
    );
    return { id: tenant.id, slug: tenant.slug, name: tenant.name };
  }

  /** Sesion del administrador de la empresa vinculado a la cuenta del dueño. */
  async enter(accountId: number, tenantId: number) {
    const admin = await tenantContext.runAsSystem(() =>
      this.prisma.user.findFirst({
        where: {
          ownerAccountId: accountId,
          tenantId,
          active: true,
          roles: { some: { role: { name: 'ADMINISTRATOR' } } },
        },
        select: { id: true },
      }),
    );
    // Una empresa de otro dueño "no existe" para esta cuenta.
    if (!admin) throw new NotFoundException('Empresa no encontrada');
    return this.auth.sessionForUser(admin.id);
  }
}
