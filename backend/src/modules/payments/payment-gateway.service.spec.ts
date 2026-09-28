import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PaymentGatewayService,
  stripeAmount,
} from './payment-gateway.service.js';

describe('PaymentGatewayService', () => {
  const config = new ConfigService({
    STRIPE_SECRET_KEY: 'sk_test_local',
    STRIPE_WEBHOOK_SECRET: 'whsec_local',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_local',
  });
  const gateway = new PaymentGatewayService(config);
  const sdk = (gateway as unknown as { stripe: Stripe }).stripe;
  afterEach(() => vi.restoreAllMocks());

  it('uses exact minor units and rejects unsupported currencies/ranges', () => {
    expect(stripeAmount(new Prisma.Decimal('19.99'), 'BOB')).toBe(1999);
    for (const [amount, currency] of [
      ['1.001', 'BOB'],
      ['1000000', 'BOB'],
      ['0', 'USD'],
      ['100', 'JPY'],
    ])
      expect(() =>
        stripeAmount(new Prisma.Decimal(amount!), currency!),
      ).toThrow();
  });

  it('validates real signatures and rejects altered, stale, live and unsigned payloads', () => {
    const payload = JSON.stringify({
      id: 'evt_test',
      object: 'event',
      livemode: false,
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test' } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_local',
    });
    expect(gateway.verifyEvent(Buffer.from(payload), signature).id).toBe(
      'evt_test',
    );
    expect(() =>
      gateway.verifyEvent(Buffer.from(payload + ' '), signature),
    ).toThrow();
    expect(() =>
      gateway.verifyEvent(Buffer.from(payload), undefined),
    ).toThrow();
    const stale = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_local',
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    expect(() => gateway.verifyEvent(Buffer.from(payload), stale)).toThrow();
    const live = payload.replace('false', 'true');
    expect(() =>
      gateway.verifyEvent(
        Buffer.from(live),
        Stripe.webhooks.generateTestHeaderString({
          payload: live,
          secret: 'whsec_local',
        }),
      ),
    ).toThrow();
  });

  it('creates a card intent with server metadata and stable idempotency key', async () => {
    const create = vi
      .spyOn(sdk.paymentIntents, 'create')
      .mockResolvedValue({ id: 'pi_test' } as never);
    await gateway.createIntent({
      amount: 1999,
      currency: 'BOB',
      saleId: 2,
      paymentId: 3,
      requestKey: 'unique',
    });
    expect(create).toHaveBeenCalledWith(
      {
        amount: 1999,
        currency: 'bob',
        payment_method_types: ['card'],
        metadata: {
          application: 'fashionstore',
          saleId: '2',
          paymentId: '3',
          requestKey: 'unique',
        },
      },
      { idempotencyKey: 'fashionstore:intent:unique' },
    );
  });

  it('recovers an existing refund without issuing another one', async () => {
    vi.spyOn(sdk.refunds, 'list').mockResolvedValue({
      data: [{ id: 're_test', metadata: { requestKey: 'unique' } }],
    } as never);
    const create = vi.spyOn(sdk.refunds, 'create');
    expect(await gateway.refundIntent('pi_test', 'unique')).toMatchObject({
      id: 're_test',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('requests a full refund with a stable key', async () => {
    vi.spyOn(sdk.refunds, 'list').mockResolvedValue({ data: [] } as never);
    const create = vi
      .spyOn(sdk.refunds, 'create')
      .mockResolvedValue({ id: 're_test' } as never);
    await gateway.refundIntent('pi_test', 'unique');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test' }),
      { idempotencyKey: 'fashionstore:refund:unique' },
    );
    expect(create.mock.calls[0]![0]).not.toHaveProperty('amount');
  });

  it('does not expose provider payloads or secrets on failures', async () => {
    vi.spyOn(sdk.paymentIntents, 'retrieve').mockRejectedValue(
      new Error('sk_test_private client_secret_private'),
    );
    await expect(gateway.retrieveIntent('pi_test')).rejects.toThrow(
      'Stripe is unavailable',
    );
  });

  it('keeps the rest of the backend usable without Stripe configuration', () => {
    const disabled = new PaymentGatewayService(new ConfigService({}));
    expect(disabled.isConfigured()).toBe(false);
    expect(() => disabled.publicConfig()).toThrow('Stripe is not configured');
  });
});
