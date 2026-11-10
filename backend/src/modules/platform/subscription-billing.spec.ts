import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import type { PaymentGatewayService } from '../payments/payment-gateway.service.js';
import type { PlatformService } from './platform.service.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';

const PRO = { id: 2, code: 'PRO', name: 'Profesional', monthlyPrice: new Prisma.Decimal(99), maxActiveBranches: 5, active: true };
const FREE = { ...PRO, id: 1, code: 'FREE', name: 'Gratuito', monthlyPrice: new Prisma.Decimal(0) };
const signup = {
  name: 'Moda Sur',
  slug: 'moda-sur',
  planCode: 'PRO',
  admin: { name: 'Ana', email: 'ana@modasur.test', password: 'Secreta123' },
};
const PUBLIC_ID = '0f0e0d0c-0b0a-4908-8706-050403020100';

function setup(plan = PRO) {
  const payments: Record<string, any> = {};
  const prisma = {
    ownerAccount: { findUnique: vi.fn(async () => null) },
    plan: { findUniqueOrThrow: vi.fn(async () => plan) },
    subscription: { findUnique: vi.fn(async () => ({ tenantId: 7, planId: 1, status: 'ACTIVE', endsAt: new Date(Date.now() + 86400_000), plan })) },
    subscriptionPayment: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 1, publicId: PUBLIC_ID, status: 'PENDING', createdAt: new Date(), paidAt: null, failureReason: null, stripeIntentId: null, tenantId: null, ...data };
        payments[row.publicId] = row;
        return row;
      }),
      update: vi.fn(async ({ data }: any) => Object.assign(payments[PUBLIC_ID], data)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = payments[PUBLIC_ID];
        if (row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => ({ ...payments[PUBLIC_ID], plan: { code: plan.code, name: plan.name }, tenant: null })),
    },
  };
  const platform = {
    assertSlugAvailable: vi.fn(async () => undefined),
    activePlan: vi.fn(async () => plan),
    signup: vi.fn(async () => ({ slug: 'moda-sur', name: 'Moda Sur' })),
    createTenant: vi.fn(async () => ({ id: 9, slug: 'moda-sur', name: 'Moda Sur' })),
    assertBranchesFit: vi.fn(async () => undefined),
    applyPaidPlanChange: vi.fn(async () => ({})),
    applyPaidRenewal: vi.fn(async () => ({})),
  };
  const intent = { id: 'pi_9', status: 'succeeded', livemode: false, amount: 9900, currency: 'usd', client_secret: 'pi_9_secret', metadata: { subscriptionPaymentId: PUBLIC_ID } };
  const gateway = {
    isConfigured: vi.fn(() => true),
    publicConfig: vi.fn(() => ({ publishableKey: 'pk_test' })),
    createSubscriptionIntent: vi.fn(async () => intent),
    retrieveIntent: vi.fn(async () => intent),
    refundIntent: vi.fn(async () => ({ id: 're_1' })),
  };
  const service = new SubscriptionBillingService(
    prisma as unknown as PrismaService,
    platform as unknown as PlatformService,
    gateway as unknown as PaymentGatewayService,
    new ConfigService({ NODE_ENV: 'test', SAAS_CURRENCY: 'USD' }),
  );
  return { service, prisma, platform, gateway, payments, intent };
}

describe('Cobro de suscripciones SaaS', () => {
  it('a free plan creates the company right away, without Stripe', async () => {
    const { service, platform, gateway } = setup(FREE);
    await expect(service.signup({ ...signup, planCode: 'FREE' })).resolves.toMatchObject({ paymentRequired: false, slug: 'moda-sur' });
    expect(platform.signup).toHaveBeenCalled();
    expect(gateway.createSubscriptionIntent).not.toHaveBeenCalled();
  });

  it('a paid plan only creates the payment (hashed password, no company) and the Stripe intent', async () => {
    const { service, platform, gateway, payments } = setup();
    const r = await service.signup(signup);
    expect(r).toMatchObject({ paymentRequired: true, paymentId: PUBLIC_ID, clientSecret: 'pi_9_secret', amount: 99, currency: 'USD' });
    expect(platform.createTenant).not.toHaveBeenCalled();
    expect(gateway.createSubscriptionIntent).toHaveBeenCalledWith(expect.objectContaining({ amount: 9900, currency: 'USD', requestKey: PUBLIC_ID }));
    const data = payments[PUBLIC_ID].signupData;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(data)).not.toContain('Secreta123');
  });

  it('creates the company once when Stripe confirms the charge, even if confirmed twice', async () => {
    const { service, platform } = setup();
    await service.signup(signup);
    const first = await service.confirm(PUBLIC_ID);
    const second = await service.confirm(PUBLIC_ID);
    expect(first.status).toBe('PAID');
    expect(second.status).toBe('PAID');
    expect(platform.createTenant).toHaveBeenCalledTimes(1);
    expect(platform.createTenant.mock.calls[0][3]).toMatch(/^\$2[aby]\$/);
  });

  it('does nothing while the card is not charged', async () => {
    const { service, platform, gateway, intent } = setup();
    await service.signup(signup);
    gateway.retrieveIntent.mockResolvedValue({ ...intent, status: 'requires_payment_method' });
    await expect(service.confirm(PUBLIC_ID)).resolves.toMatchObject({ status: 'PENDING' });
    expect(platform.createTenant).not.toHaveBeenCalled();
  });

  it('refunds the charge when the company can no longer be created', async () => {
    const { service, platform, gateway } = setup();
    await service.signup(signup);
    platform.createTenant.mockRejectedValue(new ConflictException('El codigo de empresa ya existe'));
    await expect(service.confirm(PUBLIC_ID)).resolves.toMatchObject({ status: 'REFUNDED', failureReason: 'El codigo de empresa ya existe' });
    expect(gateway.refundIntent).toHaveBeenCalledWith('pi_9', `subscription:${PUBLIC_ID}`);
  });

  it('rejects a Stripe charge that does not match the payment', async () => {
    const { service, platform, gateway, intent } = setup();
    await service.signup(signup);
    gateway.retrieveIntent.mockResolvedValue({ ...intent, amount: 100 });
    await expect(service.confirm(PUBLIC_ID)).resolves.toMatchObject({ status: 'FAILED' });
    expect(platform.createTenant).not.toHaveBeenCalled();
  });

  it('charges a plan change and applies it only after payment', async () => {
    const { service, platform } = setup();
    const r = await service.changePlan(7, 3, 'PRO');
    expect(r).toMatchObject({ paymentRequired: true, kind: 'CHANGE_PLAN' });
    expect(platform.applyPaidPlanChange).not.toHaveBeenCalled();
    await service.confirm(PUBLIC_ID);
    expect(platform.applyPaidPlanChange).toHaveBeenCalledWith(7, 2, 1, 'Pago Stripe pi_9', 3);
  });

  it('switches to a free plan without payment and refuses the plan already active', async () => {
    const free = setup(FREE);
    free.prisma.subscription.findUnique.mockResolvedValue({ tenantId: 7, planId: 2, status: 'ACTIVE', endsAt: new Date(Date.now() + 86400_000), plan: PRO });
    await expect(free.service.changePlan(7, 3, 'FREE')).resolves.toMatchObject({ paymentRequired: false });
    expect(free.platform.applyPaidPlanChange).toHaveBeenCalled();
    const same = setup();
    same.prisma.subscription.findUnique.mockResolvedValue({ tenantId: 7, planId: 2, status: 'ACTIVE', endsAt: new Date(Date.now() + 86400_000), plan: PRO });
    await expect(same.service.changePlan(7, 3, 'PRO')).rejects.toBeInstanceOf(ConflictException);
  });
});
