import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import type Stripe from 'stripe';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import {
  Prisma,
  type SubscriptionPayment,
  type SubscriptionPaymentKind,
} from '../../generated/prisma/client.js';
import {
  PaymentGatewayService,
  stripeAmount,
} from '../payments/payment-gateway.service.js';
import type { SignupTenantDto } from './dto/platform.dto.js';
import { PlatformService } from './platform.service.js';

type Plan = { id: number; code: string; name: string; monthlyPrice: Prisma.Decimal; maxActiveBranches: number };
interface SignupData {
  name: string;
  slug: string;
  admin?: { name: string; email: string };
  passwordHash?: string;
}

const KIND_LABEL: Record<SubscriptionPaymentKind, string> = {
  SIGNUP: 'Alta de empresa',
  NEW_TENANT: 'Nueva empresa',
  CHANGE_PLAN: 'Cambio de plan',
  RENEW: 'Renovacion',
};
const RECONCILE_EVERY_MS = 2 * 60 * 1000;

/**
 * Cobro de suscripciones SaaS con Stripe. Cada operacion de pago crea un registro
 * `pagos_suscripcion` y un Payment Intent; el efecto (crear la empresa, cambiar el plan o
 * renovar) se aplica solo cuando Stripe confirma el cobro, una sola vez. Un proceso
 * periodico completa los pagos confirmados aunque el navegador se haya cerrado.
 */
@Injectable()
export class SubscriptionBillingService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionBillingService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
    private readonly gateway: PaymentGatewayService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get currency() {
    return (this.config.get<string>('SAAS_CURRENCY') ?? 'USD').toUpperCase();
  }

  private get saltRounds() {
    return this.config.get<number>('app.passwordSaltRounds') ?? 12;
  }

  /* ------------------------------ inicio de cobros ------------------------------ */

  /** Alta publica: plan gratuito sin cobro; plan de pago crea la empresa al confirmar. */
  async signup(dto: SignupTenantDto) {
    const email = dto.admin.email.trim().toLowerCase();
    await this.platform.assertSlugAvailable(dto.slug);
    if (
      await tenantContext.runAsSystem(() =>
        this.prisma.ownerAccount.findUnique({ where: { email } }),
      )
    )
      throw new ConflictException(
        'Ya existe una cuenta con ese correo: inicia sesion y crea la empresa desde Mis empresas',
      );
    const plan = await this.platform.activePlan(dto.planCode);
    if (plan.monthlyPrice.lte(0))
      return { paymentRequired: false, ...(await this.platform.signup(dto)) };
    const signupData: SignupData = {
      name: dto.name,
      slug: dto.slug,
      admin: { name: dto.admin.name, email },
      passwordHash: await hash(dto.admin.password, this.saltRounds),
    };
    return this.checkout('SIGNUP', plan, { signupData });
  }

  /** Empresa adicional de un dueño. */
  async ownerTenant(
    accountId: number,
    dto: { name: string; slug: string; planCode: string },
    createFree: () => Promise<{ id: number; slug: string; name: string }>,
  ) {
    await this.platform.assertSlugAvailable(dto.slug);
    const plan = await this.platform.activePlan(dto.planCode);
    if (plan.monthlyPrice.lte(0))
      return { paymentRequired: false, ...(await createFree()) };
    return this.checkout('NEW_TENANT', plan, {
      ownerAccountId: accountId,
      signupData: { name: dto.name, slug: dto.slug },
    });
  }

  /** Cambio de plan pedido por el administrador o el dueño de la empresa. */
  async changePlan(tenantId: number, userId: number | null, planCode: string) {
    const plan = await this.platform.activePlan(planCode);
    const subscription = await tenantContext.runAsSystem(() =>
      this.prisma.subscription.findUnique({ where: { tenantId } }),
    );
    if (!subscription)
      throw new NotFoundException('La empresa no tiene suscripcion');
    if (
      subscription.planId === plan.id &&
      subscription.status === 'ACTIVE' &&
      subscription.endsAt > new Date()
    )
      throw new ConflictException(
        'La empresa ya tiene ese plan; para extenderlo usa Renovar',
      );
    await this.platform.assertBranchesFit(tenantId, plan);
    if (plan.monthlyPrice.lte(0)) {
      await this.platform.applyPaidPlanChange(
        tenantId,
        plan.id,
        1,
        `Cambio al plan ${plan.name} (sin costo)`,
        userId,
      );
      return { paymentRequired: false, status: 'PAID' as const };
    }
    return this.checkout('CHANGE_PLAN', plan, { tenantId, requestedById: userId });
  }

  /** Renovacion del plan actual (1 a 12 meses). */
  async renew(tenantId: number, userId: number | null, months: number) {
    const subscription = await tenantContext.runAsSystem(() =>
      this.prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
    );
    if (!subscription)
      throw new NotFoundException('La empresa no tiene suscripcion');
    if (!subscription.plan.active)
      throw new ConflictException(
        'Tu plan ya no se ofrece: elige otro plan para continuar',
      );
    if (subscription.plan.monthlyPrice.lte(0)) {
      await this.platform.applyPaidRenewal(
        tenantId,
        months,
        'Renovacion del plan gratuito',
        userId,
      );
      return { paymentRequired: false, status: 'PAID' as const };
    }
    return this.checkout('RENEW', subscription.plan, {
      tenantId,
      requestedById: userId,
      months,
    });
  }

  private async checkout(
    kind: SubscriptionPaymentKind,
    plan: Plan,
    data: {
      tenantId?: number;
      ownerAccountId?: number;
      requestedById?: number | null;
      months?: number;
      signupData?: SignupData;
    },
  ) {
    if (!this.gateway.isConfigured())
      throw new ServiceUnavailableException('Stripe is not configured');
    const months = data.months ?? 1;
    const amount = plan.monthlyPrice.mul(months);
    const minor = stripeAmount(amount, this.currency);
    const payment = await tenantContext.runAsSystem(() =>
      this.prisma.subscriptionPayment.create({
        data: {
          kind,
          planId: plan.id,
          months,
          amount,
          currency: this.currency,
          tenantId: data.tenantId,
          ownerAccountId: data.ownerAccountId,
          requestedById: data.requestedById ?? null,
          signupData: data.signupData
            ? (data.signupData as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      }),
    );
    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.gateway.createSubscriptionIntent({
        amount: minor,
        currency: this.currency,
        requestKey: payment.publicId,
        description: `FashionStore · ${KIND_LABEL[kind]} · Plan ${plan.name}`,
        metadata: {
          kind: 'subscription',
          subscriptionPaymentId: payment.publicId,
          planCode: plan.code,
        },
      });
    } catch (error) {
      await this.mark(payment.id, 'FAILED', 'No se pudo crear el cobro en Stripe');
      throw error;
    }
    await tenantContext.runAsSystem(() =>
      this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { stripeIntentId: intent.id },
      }),
    );
    return {
      paymentRequired: true,
      paymentId: payment.publicId,
      clientSecret: intent.client_secret,
      publishableKey: this.gateway.publicConfig().publishableKey,
      amount: amount.toNumber(),
      currency: this.currency,
      months,
      plan: { code: plan.code, name: plan.name },
      kind,
    };
  }

  /* --------------------------- confirmacion y efecto ---------------------------- */

  /**
   * Consulta el pago en Stripe y, si se cobro, aplica su efecto una sola vez. Es seguro
   * llamarlo varias veces y sin sesion: solo un cobro real de ese mismo intento lo completa.
   */
  async confirm(publicId: string) {
    let payment = await this.byPublicId(publicId);
    if (payment.status === 'PENDING' && payment.stripeIntentId) {
      const intent = await this.gateway.retrieveIntent(payment.stripeIntentId);
      if (intent.status === 'succeeded') await this.complete(payment, intent);
      else if (intent.status === 'canceled')
        await this.mark(payment.id, 'FAILED', 'El cobro fue cancelado');
      payment = await this.byPublicId(publicId);
    }
    return this.present(payment);
  }

  /** Pagos confirmados cuyo efecto no se aplico (navegador cerrado, red caida). */
  async reconcile() {
    if (this.running || !this.gateway.isConfigured()) return 0;
    this.running = true;
    let done = 0;
    try {
      const pending = await tenantContext.runAsSystem(() =>
        this.prisma.subscriptionPayment.findMany({
          where: {
            status: 'PENDING',
            stripeIntentId: { not: null },
            createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
          },
          orderBy: { id: 'asc' },
          take: 50,
        }),
      );
      for (const payment of pending) {
        try {
          const result = await this.confirm(payment.publicId);
          if (result.status === 'PAID') done++;
        } catch (error) {
          this.logger.error(
            `No se pudo conciliar el pago de suscripcion ${payment.id}: ${String(error)}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
    return done;
  }

  private async complete(payment: SubscriptionPayment, intent: Stripe.PaymentIntent) {
    if (
      intent.livemode ||
      intent.metadata?.subscriptionPaymentId !== payment.publicId ||
      intent.amount !== stripeAmount(payment.amount, payment.currency) ||
      intent.currency.toUpperCase() !== payment.currency
    ) {
      await this.mark(payment.id, 'FAILED', 'El cobro de Stripe no coincide con el pago');
      return;
    }
    // Reclamo atomico: dos confirmaciones simultaneas no aplican dos veces el efecto.
    const claimed = await tenantContext.runAsSystem(() =>
      this.prisma.subscriptionPayment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      }),
    );
    if (claimed.count !== 1) return;
    const note = `Pago Stripe ${intent.id}`;
    try {
      const tenantId = await this.applyEffect(payment, note);
      await tenantContext.runAsSystem(() =>
        this.prisma.subscriptionPayment.update({
          where: { id: payment.id },
          data: { status: 'PAID', paidAt: new Date(), tenantId },
        }),
      );
    } catch (error) {
      const definitive =
        error instanceof HttpException && error.getStatus() < 500;
      if (!definitive) {
        // Error transitorio: vuelve a pendiente para reintentar.
        await tenantContext.runAsSystem(() =>
          this.prisma.subscriptionPayment.update({
            where: { id: payment.id },
            data: { status: 'PENDING' },
          }),
        );
        throw error;
      }
      // No se puede aplicar (codigo tomado, plan inactivo, demasiadas sucursales): se devuelve el dinero.
      const reason = error instanceof Error ? error.message : 'No se pudo aplicar';
      try {
        await this.gateway.refundIntent(intent.id, `subscription:${payment.publicId}`);
        await this.mark(payment.id, 'REFUNDED', reason);
      } catch (refundError) {
        this.logger.error(
          `Pago de suscripcion ${payment.id} sin aplicar ni reembolsar: ${String(refundError)}`,
        );
        await this.mark(payment.id, 'FAILED', `${reason} (reembolso pendiente)`);
      }
    }
  }

  private async applyEffect(payment: SubscriptionPayment, note: string) {
    const data = (payment.signupData ?? {}) as unknown as SignupData;
    const plan = await tenantContext.runAsSystem(() =>
      this.prisma.plan.findUniqueOrThrow({ where: { id: payment.planId } }),
    );
    switch (payment.kind) {
      case 'SIGNUP': {
        if (
          await tenantContext.runAsSystem(() =>
            this.prisma.ownerAccount.findUnique({
              where: { email: data.admin!.email },
            }),
          )
        )
          throw new ConflictException('Ya existe una cuenta con ese correo');
        const tenant = await this.platform.createTenant(
          {
            name: data.name,
            slug: data.slug,
            planCode: plan.code,
            months: payment.months,
            admin: { name: data.admin!.name, email: data.admin!.email, password: '-' },
          },
          null,
          undefined,
          data.passwordHash,
        );
        return tenant.id;
      }
      case 'NEW_TENANT': {
        if (!payment.ownerAccountId)
          throw new BadRequestException('Pago sin cuenta de dueño');
        const tenant = await this.platform.createTenant(
          {
            name: data.name,
            slug: data.slug,
            planCode: plan.code,
            months: payment.months,
            admin: { name: '-', email: '-', password: '-' },
          },
          null,
          { accountId: payment.ownerAccountId },
        );
        return tenant.id;
      }
      case 'CHANGE_PLAN':
        await this.platform.applyPaidPlanChange(
          payment.tenantId!,
          payment.planId,
          payment.months,
          note,
          payment.requestedById,
        );
        return payment.tenantId!;
      case 'RENEW':
        await this.platform.applyPaidRenewal(
          payment.tenantId!,
          payment.months,
          note,
          payment.requestedById,
        );
        return payment.tenantId!;
    }
  }

  /* --------------------------------- consultas --------------------------------- */

  /** Pagos de una empresa (para su pantalla de plan). */
  tenantPayments(tenantId: number) {
    return tenantContext.runAsSystem(async () =>
      (
        await this.prisma.subscriptionPayment.findMany({
          where: { tenantId, status: { in: ['PAID', 'REFUNDED'] } },
          include: { plan: { select: { code: true, name: true } } },
          orderBy: { id: 'desc' },
          take: 24,
        })
      ).map((p) => this.present(p)),
    );
  }

  /** Superadmin: todos los pagos de suscripcion, con su empresa. */
  async platformPayments(page = 1, limit = 20, status?: string) {
    const where: Prisma.SubscriptionPaymentWhereInput = status
      ? { status: status as SubscriptionPayment['status'] }
      : { status: { not: 'PENDING' } };
    return tenantContext.runAsSystem(async () => {
      const [rows, total] = await Promise.all([
        this.prisma.subscriptionPayment.findMany({
          where,
          include: {
            plan: { select: { code: true, name: true } },
            tenant: { select: { id: true, slug: true, name: true } },
            ownerAccount: { select: { email: true } },
          },
          orderBy: { id: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.subscriptionPayment.count({ where }),
      ]);
      return {
        data: rows.map((p) => ({
          ...this.present(p),
          tenant: p.tenant,
          owner: p.ownerAccount?.email ?? (p.signupData as SignupData | null)?.admin?.email ?? null,
          requestedSlug: (p.signupData as SignupData | null)?.slug ?? null,
        })),
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  /** Superadmin: resumen del negocio SaaS. */
  dashboard() {
    return tenantContext.runAsSystem(async () => {
      const now = new Date();
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const in7 = new Date(now.getTime() + 7 * 86400_000);
      const [tenants, subs, paidMonth, paidTotal, expiring, plans, failed] =
        await Promise.all([
          this.prisma.tenant.groupBy({ by: ['status'], _count: true }),
          this.prisma.subscription.findMany({
            select: { status: true, endsAt: true, plan: { select: { code: true, name: true, monthlyPrice: true } } },
          }),
          this.prisma.subscriptionPayment.aggregate({
            where: { status: 'PAID', paidAt: { gte: month } },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.subscriptionPayment.aggregate({
            where: { status: 'PAID' },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.subscription.findMany({
            where: { status: 'ACTIVE', endsAt: { gte: now, lte: in7 } },
            select: { endsAt: true, tenant: { select: { id: true, name: true, slug: true } }, plan: { select: { name: true } } },
            orderBy: { endsAt: 'asc' },
          }),
          this.prisma.plan.findMany({ select: { code: true, name: true } }),
          this.prisma.subscriptionPayment.count({
            where: { status: { in: ['FAILED', 'REFUNDED'] } },
          }),
        ]);
      const vigente = (s: (typeof subs)[number]) => s.status === 'ACTIVE' && s.endsAt > now;
      const mrr = subs
        .filter(vigente)
        .reduce((sum, s) => sum.plus(s.plan.monthlyPrice), new Prisma.Decimal(0));
      return {
        currency: this.currency,
        tenants: {
          total: tenants.reduce((n, t) => n + t._count, 0),
          active: tenants.find((t) => t.status === 'ACTIVE')?._count ?? 0,
          inactive: tenants.find((t) => t.status === 'INACTIVE')?._count ?? 0,
        },
        subscriptions: {
          active: subs.filter(vigente).length,
          expired: subs.filter((s) => s.status === 'EXPIRED' || (s.status === 'ACTIVE' && s.endsAt <= now)).length,
          suspended: subs.filter((s) => s.status === 'SUSPENDED').length,
          cancelled: subs.filter((s) => s.status === 'CANCELLED').length,
        },
        byPlan: plans.map((p) => ({
          ...p,
          count: subs.filter((s) => vigente(s) && s.plan.code === p.code).length,
        })),
        revenue: {
          mrr: mrr.toNumber(),
          month: paidMonth._sum.amount?.toNumber() ?? 0,
          monthPayments: paidMonth._count,
          total: paidTotal._sum.amount?.toNumber() ?? 0,
          totalPayments: paidTotal._count,
          failedOrRefunded: failed,
        },
        expiringSoon: expiring.map((e) => ({
          tenant: e.tenant,
          plan: e.plan.name,
          endsAt: e.endsAt,
        })),
      };
    });
  }

  /* --------------------------------- auxiliares -------------------------------- */

  private async byPublicId(publicId: string) {
    const payment = await tenantContext.runAsSystem(() =>
      this.prisma.subscriptionPayment.findUnique({
        where: { publicId },
        include: {
          plan: { select: { code: true, name: true } },
          tenant: { select: { id: true, slug: true, name: true } },
        },
      }),
    );
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return payment;
  }

  private mark(id: number, status: 'FAILED' | 'REFUNDED', reason: string) {
    return tenantContext.runAsSystem(() =>
      this.prisma.subscriptionPayment.update({
        where: { id },
        data: { status, failureReason: reason.slice(0, 250) },
      }),
    );
  }

  private present(
    p: SubscriptionPayment & {
      plan?: { code: string; name: string };
      tenant?: { id: number; slug: string; name: string } | null;
    },
  ) {
    return {
      paymentId: p.publicId,
      kind: p.kind,
      kindLabel: KIND_LABEL[p.kind],
      status: p.status === 'PROCESSING' ? 'PENDING' : p.status,
      amount: p.amount.toNumber(),
      currency: p.currency,
      months: p.months,
      plan: p.plan ?? null,
      tenant: p.tenant ?? null,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    };
  }
}
