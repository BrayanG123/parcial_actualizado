import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Prisma } from '../../generated/prisma/client.js';

export function stripeAmount(total: Prisma.Decimal, currency: string): number {
  // Explicit support avoids silently multiplying a zero-decimal currency by 100.
  if (!['BOB', 'USD', 'EUR'].includes(currency))
    throw new BadRequestException(
      'Stripe currently supports BOB, USD and EUR in this application',
    );
  const amount = total.mul(100);
  if (!amount.isInteger() || amount.lt(1) || amount.gt(99999999))
    throw new BadRequestException(
      'Amount is outside the supported Stripe range',
    );
  return amount.toNumber();
}

@Injectable()
export class PaymentGatewayService {
  private readonly stripe?: Stripe;
  constructor(private readonly config: ConfigService) {
    const secret = config.get<string>('STRIPE_SECRET_KEY');
    if (secret)
      this.stripe = new Stripe(secret, {
        maxNetworkRetries: 2,
        timeout: 10000,
      });
  }

  isConfigured() {
    return Boolean(
      this.stripe &&
      this.config.get('STRIPE_WEBHOOK_SECRET') &&
      this.config.get('STRIPE_PUBLISHABLE_KEY'),
    );
  }

  publicConfig() {
    this.client();
    return {
      publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY'),
      mode: 'test',
      currencies: ['BOB', 'USD', 'EUR'],
    };
  }

  verifyEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    const stripe = this.client();
    if (!rawBody || !signature)
      throw new BadRequestException(
        'Stripe signature and raw body are required',
      );
    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
      );
      if (event.livemode) throw new Error('Live events are disabled');
      return event;
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature or mode');
    }
  }

  createIntent(input: {
    amount: number;
    currency: string;
    saleId: number;
    paymentId: number;
    requestKey: string;
  }): Promise<Stripe.PaymentIntent> {
    return this.call(() =>
      this.client().paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          payment_method_types: ['card'],
          metadata: {
            application: 'fashionstore',
            saleId: String(input.saleId),
            paymentId: String(input.paymentId),
            requestKey: input.requestKey,
          },
        },
        { idempotencyKey: 'fashionstore:intent:' + input.requestKey },
      ),
    );
  }

  retrieveIntent(id: string): Promise<Stripe.PaymentIntent> {
    return this.call(() => this.client().paymentIntents.retrieve(id));
  }

  cancelIntent(id: string): Promise<Stripe.PaymentIntent> {
    return this.call(() =>
      this.client().paymentIntents.cancel(
        id,
        {},
        { idempotencyKey: 'fashionstore:cancel:' + id },
      ),
    );
  }

  async refundIntent(id: string, requestKey: string): Promise<Stripe.Refund> {
    // Recover a successful refund after a network/database failure, even beyond
    // Stripe's idempotency retention window. Never request a partial refund here.
    const refunds = await this.call(() =>
      this.client().refunds.list({ payment_intent: id, limit: 100 }),
    );
    const existing = refunds.data.find(
      (refund) => refund.metadata?.requestKey === requestKey,
    );
    if (existing) return existing;
    return this.call(() =>
      this.client().refunds.create(
        {
          payment_intent: id,
          metadata: {
            application: 'fashionstore',
            requestKey,
            reason: 'checkout_expired_or_cancelled',
          },
        },
        { idempotencyKey: 'fashionstore:refund:' + requestKey },
      ),
    );
  }

  retrieveRefund(id: string): Promise<Stripe.Refund> {
    return this.call(() => this.client().refunds.retrieve(id));
  }

  private client(): Stripe {
    if (!this.isConfigured() || !this.stripe)
      throw new ServiceUnavailableException('Stripe is not configured');
    return this.stripe;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError)
        throw new BadRequestException(
          'Stripe rejected the operation; check amount, currency and provider state',
        );
      // Do not expose SDK payloads, API keys or client secrets in errors/logs.
      throw new ServiceUnavailableException(
        'Stripe is unavailable; retry the same operation',
      );
    }
  }
}
