// Explicit integration check: real Stripe test API + an isolated PostgreSQL schema.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import request from 'supertest';
import { it } from 'vitest';

async function main() {
  if (process.env.RUN_STRIPE_SMOKE !== 'true' || !process.env.TEST_DATABASE_URL)
    throw new Error(
      'Set RUN_STRIPE_SMOKE=true and TEST_DATABASE_URL to run this test',
    );
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret?.startsWith('sk_test_'))
    throw new Error('Only Stripe test credentials are allowed');
  process.env.NODE_ENV = 'test';
  const { cartTestContext } =
    await import('../test/helpers/cart-test-context.js');
  const { PaymentsService } =
    await import('../src/modules/payments/payments.service.js');
  const stripe = new Stripe(secret, { maxNetworkRetries: 2, timeout: 10000 });
  const ctx = await cartTestContext(process.env.TEST_DATABASE_URL);
  const payments = ctx.app.get(PaymentsService);
  const actor = {
    id: ctx.users[0]!.id,
    email: ctx.users[0]!.email,
    roles: ['CUSTOMER'] as import('../src/common/enums/role.enum.js').Role[],
  };
  const auth = { Authorization: `Bearer ${ctx.tokens[0]}` };
  const created: string[] = [];
  try {
    for (const late of [false, true]) {
      const cart = await request(ctx.app.getHttpServer())
        .post('/api/v1/cart/items')
        .set(auth)
        .send({
          productId: ctx.product.id,
          sizeId: ctx.size.id,
          colorId: ctx.color.id,
          quantity: 1,
        })
        .expect(201);
      const cartId = cart.body.data.id as number;
      const quote = await request(ctx.app.getHttpServer())
        .post('/api/v1/sales/checkout/preview')
        .set(auth)
        .send({ cartId, branchId: ctx.branch.id })
        .expect(201);
      const sale = await request(ctx.app.getHttpServer())
        .post('/api/v1/sales/checkout')
        .set(auth)
        .send({
          cartId,
          branchId: ctx.branch.id,
          quoteHash: quote.body.data.quoteHash,
          channel: 'WEB',
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      const saleId = sale.body.data.id as number;
      const started = await payments.createIntent(saleId, actor);
      assert(started.paymentIntentId);
      created.push(started.paymentIntentId);
      const repeated = await payments.createIntent(saleId, actor);
      assert.equal(repeated.paymentIntentId, started.paymentIntentId);
      if (late)
        await ctx.prisma.sale.update({
          where: { id: saleId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      const confirmed = await stripe.paymentIntents.confirm(
        started.paymentIntentId,
        { payment_method: 'pm_card_visa' },
        { idempotencyKey: 'smoke:confirm:' + started.paymentIntentId },
      );
      assert.equal(confirmed.status, 'succeeded');
      await payments.reconcilePendingPayments();
      const result = await ctx.prisma.payment.findFirstOrThrow({
        where: { saleId },
      });
      assert.equal(result.status, late ? 'REFUNDED' : 'APPROVED');
      assert.equal(
        (await ctx.prisma.sale.findUniqueOrThrow({ where: { id: saleId } }))
          .status,
        late ? 'CANCELLED' : 'COMPLETED',
      );
      console.log(
        late
          ? 'Real Stripe test: expired payment refunded successfully'
          : 'Real Stripe test: payment confirmed and sale completed successfully',
      );
    }
    const stock = await ctx.prisma.inventory.findFirstOrThrow({
      where: { branchId: ctx.branch.id, sizeId: ctx.size.id },
    });
    assert.equal(stock.physicalQuantity, 9);
    assert.equal(stock.reservedQuantity, 0);
    console.log('Real Stripe test: idempotency and inventory verified');
  } finally {
    // Test objects remain visible in Stripe. Refund any successful test charge
    // that was not automatically refunded; cancel unpaid test intents.
    for (const id of created) {
      try {
        const intent = await stripe.paymentIntents.retrieve(id);
        if (intent.status === 'succeeded') {
          const existing = await stripe.refunds.list({
            payment_intent: id,
            limit: 100,
          });
          if (
            !existing.data.some((refund) =>
              ['succeeded', 'pending'].includes(refund.status ?? ''),
            )
          )
            await stripe.refunds.create(
              { payment_intent: id },
              { idempotencyKey: 'smoke:cleanup:' + id },
            );
        } else if (intent.status !== 'canceled')
          await stripe.paymentIntents.cancel(id);
      } catch {
        console.error('Test Stripe cleanup requires review for intent ' + id);
        process.exitCode = 1;
      }
    }
    await ctx.close();
  }
}

it('completes and refunds payments through the real Stripe test API', async () => {
  try {
    await main();
  } catch (error) {
    // Keep SDK headers/request payloads out of the test reporter.
    if (error instanceof Stripe.errors.StripeError)
      throw new Error(
        `Stripe test API failed: ${error.type} (${error.code ?? 'no_code'})`,
      );
    throw error;
  }
}, 120000);
