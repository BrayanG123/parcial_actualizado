import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import request from 'supertest';
import { cartTestContext } from './helpers/cart-test-context.js';
import { PaymentGatewayService } from '../src/modules/payments/payment-gateway.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { PaymentsRepository } from '../src/modules/payments/payments.repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Stripe payments (HTTP, signed webhooks and PostgreSQL)',
  () => {
    let ctx: Awaited<ReturnType<typeof cartTestContext>>;
    let payments: PaymentsService;
    const intents = new Map<string, Stripe.PaymentIntent>();
    const refunds = new Map<string, Stripe.Refund>();
    const gateway = new PaymentGatewayService(
      new ConfigService({
        STRIPE_SECRET_KEY: 'sk_test_local',
        STRIPE_PUBLISHABLE_KEY: 'pk_test_local',
        STRIPE_WEBHOOK_SECRET: 'whsec_local',
      }),
    );
    let refundCalls = 0;
    const auth = (index = 0) => ({
      Authorization: `Bearer ${ctx.tokens[index]}`,
    });
    const stock = () =>
      ctx.prisma.inventory.findFirstOrThrow({
        where: { branchId: ctx.branch.id, sizeId: ctx.size.id },
      });
    const create = (saleId: number, index = 0, extra: object = {}) =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/payments/stripe/intents')
        .set(auth(index))
        .send({ saleId, ...extra });
    const cancel = (id: number) =>
      request(ctx.app.getHttpServer())
        .patch(`/api/v1/sales/${id}/cancel`)
        .set(auth());
    const webhook = (intentId: string, type = 'payment_intent.succeeded') => {
      const payload = JSON.stringify({
        id: 'evt_' + randomUUID(),
        object: 'event',
        type,
        livemode: false,
        data: { object: { id: intentId } },
      });
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_local',
      });
      return request(ctx.app.getHttpServer())
        .post('/api/v1/payments/stripe/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(payload);
    };
    const order = async () => {
      const added = await request(ctx.app.getHttpServer())
        .post('/api/v1/cart/items')
        .set(auth())
        .send({
          productId: ctx.product.id,
          sizeId: ctx.size.id,
          colorId: ctx.color.id,
          quantity: 1,
        })
        .expect(201);
      const cartId = added.body.data.id;
      const preview = await request(ctx.app.getHttpServer())
        .post('/api/v1/sales/checkout/preview')
        .set(auth())
        .send({ cartId, branchId: ctx.branch.id })
        .expect(201);
      const sale = await request(ctx.app.getHttpServer())
        .post('/api/v1/sales/checkout')
        .set(auth())
        .send({
          cartId,
          branchId: ctx.branch.id,
          quoteHash: preview.body.data.quoteHash,
          channel: 'WEB',
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      return sale.body.data.id as number;
    };
    const paidIntent = async (saleId: number) => {
      const response = await create(saleId).expect(201);
      const intent = intents.get(response.body.data.paymentIntentId)!;
      intent.status = 'succeeded';
      intent.amount_received = intent.amount;
      return intent;
    };

    beforeAll(async () => {
      vi.spyOn(gateway, 'createIntent').mockImplementation(async (input) => {
        const id = 'pi_' + input.requestKey;
        if (!intents.has(id))
          intents.set(id, {
            id,
            object: 'payment_intent',
            amount: input.amount,
            amount_received: 0,
            currency: input.currency.toLowerCase(),
            status: 'requires_payment_method',
            livemode: false,
            client_secret: id + '_secret_local',
            metadata: {
              application: 'fashionstore',
              saleId: String(input.saleId),
              paymentId: String(input.paymentId),
              requestKey: input.requestKey,
            },
          } as unknown as Stripe.PaymentIntent);
        return structuredClone(intents.get(id)!);
      });
      vi.spyOn(gateway, 'retrieveIntent').mockImplementation(async (id) =>
        structuredClone(intents.get(id)!),
      );
      vi.spyOn(gateway, 'cancelIntent').mockImplementation(async (id) => {
        const intent = intents.get(id)!;
        if (intent.status === 'succeeded') throw new Error('Already paid');
        intent.status = 'canceled';
        return structuredClone(intent);
      });
      vi.spyOn(gateway, 'refundIntent').mockImplementation(async (id, key) => {
        refundCalls++;
        const intent = intents.get(id)!;
        const refundId = 're_' + key;
        if (!refunds.has(refundId))
          refunds.set(refundId, {
            id: refundId,
            object: 'refund',
            payment_intent: id,
            amount: intent.amount,
            currency: intent.currency,
            status: 'succeeded',
          } as Stripe.Refund);
        return structuredClone(refunds.get(refundId)!);
      });
      vi.spyOn(gateway, 'retrieveRefund').mockImplementation(async (id) =>
        structuredClone(refunds.get(id)!),
      );
      ctx = await cartTestContext(databaseUrl!, gateway);
      payments = ctx.app.get(PaymentsService);
    }, 30000);
    beforeEach(async () => {
      await ctx.prisma.payment.deleteMany();
      await ctx.prisma.sale.deleteMany();
      await ctx.prisma.cart.deleteMany();
      await ctx.prisma.inventoryMovement.deleteMany();
      await ctx.prisma.inventory.updateMany({
        data: { physicalQuantity: 10, reservedQuantity: 0 },
      });
      intents.clear();
      refunds.clear();
      refundCalls = 0;
    });
    afterAll(async () => {
      await ctx?.close();
      vi.restoreAllMocks();
    });

    it('creates one intent on concurrent retries and only exposes its secret to its owner', async () => {
      const saleId = await order();
      const responses = await Promise.all([create(saleId), create(saleId)]);
      expect(responses.map((r) => r.status)).toEqual([201, 201]);
      expect(responses[0]!.body.data.paymentIntentId).toBe(
        responses[1]!.body.data.paymentIntentId,
      );
      expect(responses[0]!.headers['cache-control']).toBe('no-store');
      expect(intents.size).toBe(1);
      expect(await ctx.prisma.payment.count()).toBe(1);
      await create(saleId, 1).expect(403);
      await create(saleId, 2).expect(403);
      const status = await request(ctx.app.getHttpServer())
        .get(`/api/v1/payments/sales/${saleId}`)
        .set(auth())
        .expect(200);
      expect(JSON.stringify(status.body)).not.toContain('_secret_');
      expect(status.body.data.payments[0]).not.toHaveProperty(
        'stripeRequestKey',
      );
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 1,
      });
    });

    it('rejects client amounts, unsigned events, and altered payloads', async () => {
      const saleId = await order();
      await create(saleId, 0, { amount: 1 }).expect(400);
      await request(ctx.app.getHttpServer())
        .post('/api/v1/payments/stripe/webhook')
        .send({ type: 'payment_intent.succeeded' })
        .expect(400);
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_local',
      });
      await request(ctx.app.getHttpServer())
        .post('/api/v1/payments/stripe/webhook')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(payload + ' ')
        .expect(400);
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 1,
      });
    });

    it('confirms a signed success once, even with concurrent and out-of-order delivery', async () => {
      const saleId = await order();
      const intent = await paidIntent(saleId);
      const responses = await Promise.all([
        webhook(intent.id),
        webhook(intent.id),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      await webhook(intent.id, 'payment_intent.payment_failed').expect(200);
      expect(
        await ctx.prisma.sale.findUniqueOrThrow({ where: { id: saleId } }),
      ).toMatchObject({ status: 'COMPLETED' });
      expect(
        await ctx.prisma.inventoryMovement.count({ where: { type: 'SALE' } }),
      ).toBe(1);
      expect(await stock()).toMatchObject({
        physicalQuantity: 9,
        reservedQuantity: 0,
      });
    });

    it('ignores events unrelated to this application', async () => {
      await webhook('pi_other_application').expect(200);
      expect(await ctx.prisma.sale.count()).toBe(0);
    });

    it('rejects an expired checkout before creating a Stripe intent', async () => {
      const saleId = await order();
      await ctx.prisma.sale.update({
        where: { id: saleId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await create(saleId).expect(409);
      expect(intents.size).toBe(0);
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 0,
      });
    });

    it('recovers an intent after a failure binding it locally without creating another', async () => {
      const saleId = await order();
      const repository = ctx.app.get(PaymentsRepository);
      const bind = vi
        .spyOn(repository, 'bind')
        .mockRejectedValueOnce(new Error('Temporary database outage'));
      try {
        const failed = await create(saleId).expect(500);
        expect(JSON.stringify(failed.body)).not.toContain('_secret_');
        expect(intents.size).toBe(1);
        await create(saleId).expect(201);
        expect(intents.size).toBe(1);
        expect(
          (await ctx.prisma.payment.findFirstOrThrow()).stripeIntentId,
        ).toBe([...intents.keys()][0]);
      } finally {
        bind.mockRestore();
      }
    });

    it('rejects provider amount/currency/metadata mismatches without consuming inventory', async () => {
      const saleId = await order();
      const intent = await paidIntent(saleId);
      intent.amount_received--;
      await webhook(intent.id).expect(409);
      intent.amount_received++;
      intent.currency = 'usd';
      await webhook(intent.id).expect(409);
      intent.currency = 'bob';
      intent.metadata.saleId = '999';
      await webhook(intent.id).expect(409);
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 1,
      });
    });

    it('keeps declined cards retryable and confirms the same intent on a later success', async () => {
      const saleId = await order();
      const response = await create(saleId).expect(201);
      const intent = intents.get(response.body.data.paymentIntentId)!;
      await webhook(intent.id, 'payment_intent.payment_failed').expect(200);
      expect((await create(saleId).expect(201)).body.data.paymentIntentId).toBe(
        intent.id,
      );
      intent.status = 'succeeded';
      intent.amount_received = intent.amount;
      await webhook(intent.id).expect(200);
      expect(await stock()).toMatchObject({
        physicalQuantity: 9,
        reservedQuantity: 0,
      });
    });

    it('refunds a late payment once and preserves released stock', async () => {
      const saleId = await order();
      const intent = await paidIntent(saleId);
      await ctx.prisma.sale.update({
        where: { id: saleId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await webhook(intent.id).expect(200);
      await webhook(intent.id).expect(200);
      expect(refundCalls).toBe(1);
      expect(await ctx.prisma.payment.findFirstOrThrow()).toMatchObject({
        status: 'REFUNDED',
        stripeRefundStatus: 'succeeded',
      });
      expect(
        await ctx.prisma.sale.findUniqueOrThrow({ where: { id: saleId } }),
      ).toMatchObject({ status: 'CANCELLED' });
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 0,
      });
    });

    it('recovers missing webhooks and cancels unpaid intents after local cancellation', async () => {
      const saleId = await order();
      await paidIntent(saleId);
      expect(await payments.reconcilePendingPayments()).toBe(1);
      expect(await stock()).toMatchObject({
        physicalQuantity: 9,
        reservedQuantity: 0,
      });
      const second = await order();
      const response = await create(second).expect(201);
      await cancel(second).expect(200);
      await payments.reconcilePendingPayments();
      expect(intents.get(response.body.data.paymentIntentId)!.status).toBe(
        'canceled',
      );
      expect(await stock()).toMatchObject({
        physicalQuantity: 9,
        reservedQuantity: 0,
      });
    });

    it('persists refund work across provider failure and retries it through reconciliation', async () => {
      const saleId = await order();
      const intent = await paidIntent(saleId);
      await cancel(saleId).expect(200);
      vi.mocked(gateway.refundIntent).mockRejectedValueOnce(
        new Error('Temporary outage'),
      );
      await webhook(intent.id).expect(500);
      expect(await ctx.prisma.payment.findFirstOrThrow()).toMatchObject({
        stripeRefundStatus: 'requested',
      });
      await payments.reconcilePendingPayments();
      expect(await ctx.prisma.payment.findFirstOrThrow()).toMatchObject({
        status: 'REFUNDED',
      });
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 0,
      });
    });

    it('concurrent cancellation and success either completes once or refunds without selling', async () => {
      const saleId = await order();
      const intent = await paidIntent(saleId);
      const results = await Promise.all([cancel(saleId), webhook(intent.id)]);
      expect(results[1]!.status).toBe(200);
      const sale = await ctx.prisma.sale.findUniqueOrThrow({
        where: { id: saleId },
      });
      const payment = await ctx.prisma.payment.findFirstOrThrow();
      if (sale.status === 'COMPLETED') {
        expect(results[0]!.status).toBe(409);
        expect(payment.status).toBe('APPROVED');
        expect(await stock()).toMatchObject({
          physicalQuantity: 9,
          reservedQuantity: 0,
        });
      } else {
        expect(results[0]!.status).toBe(200);
        expect(payment.status).toBe('REFUNDED');
        expect(await stock()).toMatchObject({
          physicalQuantity: 10,
          reservedQuantity: 0,
        });
      }
    });

    it('reconciles a pending refund to succeeded without issuing another refund', async () => {
      const saleId = await order();
      const intent = await paidIntent(saleId);
      await cancel(saleId).expect(200);
      const id = 're_pending';
      refunds.set(id, {
        id,
        payment_intent: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        status: 'pending',
      } as Stripe.Refund);
      vi.mocked(gateway.refundIntent).mockResolvedValueOnce(
        structuredClone(refunds.get(id)!),
      );
      await webhook(intent.id).expect(200);
      expect((await ctx.prisma.payment.findFirstOrThrow()).status).toBe(
        'VOIDED',
      );
      refunds.get(id)!.status = 'succeeded';
      await payments.reconcilePendingPayments();
      expect((await ctx.prisma.payment.findFirstOrThrow()).status).toBe(
        'REFUNDED',
      );
      expect(refundCalls).toBe(0);
    });

    it('cancels the sale and releases stock if Stripe cancels the intent', async () => {
      const saleId = await order();
      const response = await create(saleId).expect(201);
      const intent = intents.get(response.body.data.paymentIntentId)!;
      intent.status = 'canceled';
      await webhook(intent.id, 'payment_intent.canceled').expect(200);
      expect(
        await ctx.prisma.sale.findUniqueOrThrow({ where: { id: saleId } }),
      ).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'STRIPE_CANCELLED',
      });
      expect(await stock()).toMatchObject({
        physicalQuantity: 10,
        reservedQuantity: 0,
      });
    });
  },
);
