import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { SalesService } from '../sales/sales.service.js';
import {
  PaymentGatewayService,
  stripeAmount,
} from './payment-gateway.service.js';
import { PaymentsRepository } from './payments.repository.js';
import type { StripePayment } from './payments.repository.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private readonly gateway: PaymentGatewayService,
    private readonly repository: PaymentsRepository,
    private readonly sales: SalesService,
  ) {}

  config() {
    return this.gateway.publicConfig();
  }

  async createIntent(saleId: number, user: AuthenticatedUser) {
    const sale = await this.sales.findOne(saleId, user);
    if (!user.roles.includes(Role.CUSTOMER) || sale.client?.userId !== user.id)
      throw new ForbiddenException(
        'Only the customer owning this sale can initiate its payment',
      );
    const payment = await this.requirePayment(saleId);
    if (sale.status !== 'PENDING_PAYMENT' || !sale.stockReserved)
      throw new ConflictException('Sale is no longer awaiting payment');
    if (!sale.expiresAt || sale.expiresAt <= new Date()) {
      await this.sales.cancelElectronicPayment(
        saleId,
        'PAYMENT_WINDOW_EXPIRED',
      );
      throw new ConflictException('Checkout expired; create a new checkout');
    }
    const amount = stripeAmount(payment.amount, sale.currency);
    const intent = payment.stripeIntentId
      ? await this.gateway.retrieveIntent(payment.stripeIntentId)
      : await this.gateway.createIntent({
          amount,
          currency: sale.currency,
          saleId,
          paymentId: payment.id,
          requestKey: payment.stripeRequestKey,
        });
    this.assertIntent(payment, intent);
    const bound = await this.repository.bind(payment.id, intent.id);
    await this.synchronize(bound, intent);
    const latest = await this.repository.byId(payment.id);
    if (latest.sale.status !== 'PENDING_PAYMENT' || !intent.client_secret)
      return {
        saleId,
        paymentId: latest.id,
        status: latest.status,
        stripeStatus: latest.stripeStatus,
        clientSecret: null,
      };
    return {
      saleId,
      paymentId: latest.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      publishableKey: this.gateway.publicConfig().publishableKey,
      status: latest.status,
      stripeStatus: latest.stripeStatus,
      amount: latest.amount.toNumber(),
      currency: latest.sale.currency,
      expiresAt: latest.sale.expiresAt,
    };
  }

  async status(saleId: number, user: AuthenticatedUser) {
    const sale = await this.sales.findOne(saleId, user);
    return {
      saleId,
      saleStatus: sale.status,
      expiresAt: sale.expiresAt,
      payments: sale.payments,
    };
  }

  async webhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const event = this.gateway.verifyEvent(rawBody, signature);
    let intentId: string | undefined;
    if (
      [
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'payment_intent.processing',
        'payment_intent.requires_action',
      ].includes(event.type)
    ) {
      intentId = (event.data.object as Stripe.PaymentIntent).id;
    } else if (
      ['refund.created', 'refund.updated', 'refund.failed'].includes(event.type)
    ) {
      const refund = event.data.object as Stripe.Refund;
      intentId =
        typeof refund.payment_intent === 'string'
          ? refund.payment_intent
          : refund.payment_intent?.id;
    }
    if (!intentId) return { received: true, ignored: true };
    const payment = await this.repository.byIntent(intentId);
    // Other applications' events cannot mutate our sales. The worker recovers
    // deliveries that arrive before an intent is bound to the local payment.
    if (!payment) return { received: true, ignored: true };
    // Always read current provider state, even for duplicate/out-of-order events.
    await this.synchronize(
      payment,
      await this.gateway.retrieveIntent(intentId),
    );
    return { received: true };
  }

  async reconcilePendingPayments() {
    if (!this.gateway.isConfigured()) return 0;
    let afterId = 0;
    let synchronized = 0;
    for (;;) {
      const batch = await this.repository.pendingSync(afterId);
      for (const row of batch) {
        try {
          const payment = await this.repository.byId(row.id);
          await this.synchronize(
            payment,
            await this.gateway.retrieveIntent(row.stripeIntentId!),
          );
          synchronized++;
        } catch {
          this.logger.error(
            `Stripe synchronization failed for local payment ${row.id}; retrying next cycle`,
          );
        }
        afterId = row.id;
      }
      if (batch.length < 100) return synchronized;
    }
  }

  private async synchronize(
    payment: StripePayment,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.assertIntent(payment, intent);
    await this.repository.recordState(payment.id, intent.status);
    if (intent.status === 'succeeded') {
      if (
        intent.amount_received !==
        stripeAmount(payment.amount, payment.sale.currency)
      )
        throw new ConflictException(
          'Stripe received amount does not match the order',
        );
      const current = await this.repository.byId(payment.id);
      if (current.status === 'REFUNDED') return;
      try {
        await this.sales.confirmElectronicPayment(payment.saleId, {
          reference: intent.id,
          amount: payment.amount.toFixed(2),
          currency: payment.sale.currency,
        });
      } catch (error) {
        const latest = await this.repository.byId(payment.id);
        if (
          !(error instanceof ConflictException) ||
          latest.sale.status !== 'CANCELLED'
        )
          throw error;
        await this.refundLatePayment(latest, intent);
      }
      return;
    }
    if (intent.status === 'canceled') {
      if (payment.sale.status === 'PENDING_PAYMENT')
        await this.sales.cancelElectronicPayment(
          payment.saleId,
          'STRIPE_CANCELLED',
        );
      return;
    }
    if (
      payment.sale.status === 'PENDING_PAYMENT' &&
      payment.sale.expiresAt &&
      payment.sale.expiresAt <= new Date()
    )
      await this.sales.cancelElectronicPayment(
        payment.saleId,
        'PAYMENT_WINDOW_EXPIRED',
      );
    const latest = await this.repository.byId(payment.id);
    if (latest.sale.status === 'CANCELLED') {
      try {
        const cancelled = await this.gateway.cancelIntent(intent.id);
        await this.repository.recordState(payment.id, cancelled.status);
      } catch (error) {
        // A charge may win the race against cancellation at Stripe.
        const refreshed = await this.gateway.retrieveIntent(intent.id);
        if (refreshed.status === 'succeeded' || refreshed.status === 'canceled')
          return this.synchronize(latest, refreshed);
        throw error;
      }
    }
  }

  private async refundLatePayment(
    payment: StripePayment,
    intent: Stripe.PaymentIntent,
  ) {
    await this.repository.requestRefund(payment.id);
    const latest = await this.repository.byId(payment.id);
    if (latest.stripeRefundStatus === 'succeeded') return;
    const refund = latest.stripeRefundId
      ? await this.gateway.retrieveRefund(latest.stripeRefundId)
      : await this.gateway.refundIntent(intent.id, latest.stripeRequestKey);
    const refundIntent =
      typeof refund.payment_intent === 'string'
        ? refund.payment_intent
        : refund.payment_intent?.id;
    if (
      refundIntent !== intent.id ||
      refund.amount !== intent.amount ||
      refund.currency !== intent.currency
    )
      throw new ConflictException(
        'Stripe refund does not match the full payment',
      );
    await this.repository.recordRefund(
      payment.id,
      refund.id,
      refund.status ?? 'pending',
    );
    if (['failed', 'canceled', 'requires_action'].includes(refund.status ?? ''))
      this.logger.error(
        `Refund requires attention in Stripe for local payment ${payment.id}`,
      );
  }

  private assertIntent(payment: StripePayment, intent: Stripe.PaymentIntent) {
    if (
      intent.livemode ||
      intent.amount !== stripeAmount(payment.amount, payment.sale.currency) ||
      intent.currency !== payment.sale.currency.toLowerCase() ||
      (payment.stripeIntentId && payment.stripeIntentId !== intent.id) ||
      intent.metadata.application !== 'fashionstore' ||
      intent.metadata.saleId !== String(payment.saleId) ||
      intent.metadata.paymentId !== String(payment.id) ||
      intent.metadata.requestKey !== payment.stripeRequestKey
    )
      throw new ConflictException('Stripe intent does not match this payment');
  }

  private async requirePayment(saleId: number) {
    const payment = await this.repository.forSale(saleId);
    if (!payment)
      throw new NotFoundException('Electronic payment was not found');
    return payment;
  }
}
