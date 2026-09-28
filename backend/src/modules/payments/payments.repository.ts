import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

const include = { sale: true } satisfies Prisma.PaymentInclude;
export type StripePayment = Prisma.PaymentGetPayload<{
  include: typeof include;
}>;

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  forSale(saleId: number) {
    return this.prisma.payment.findFirst({
      where: { saleId, type: 'ELECTRONIC', method: 'GATEWAY' },
      include,
      orderBy: { id: 'asc' },
    });
  }
  byId(id: number) {
    return this.prisma.payment.findUniqueOrThrow({ where: { id }, include });
  }
  byIntent(stripeIntentId: string) {
    return this.prisma.payment.findUnique({
      where: { stripeIntentId },
      include,
    });
  }

  async bind(id: number, stripeIntentId: string) {
    const result = await this.prisma.payment.updateMany({
      where: { id, OR: [{ stripeIntentId: null }, { stripeIntentId }] },
      data: { stripeIntentId },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Payment already has a different Stripe intent',
      );
    return this.byId(id);
  }

  async recordState(id: number, stripeStatus: string) {
    await this.prisma.payment.updateMany({
      where: {
        id,
        ...(['succeeded', 'canceled'].includes(stripeStatus)
          ? {}
          : {
              OR: [
                { stripeStatus: null },
                { stripeStatus: { notIn: ['succeeded', 'canceled'] } },
              ],
            }),
      },
      data: { stripeStatus, lastStripeSyncAt: new Date() },
    });
  }

  requestRefund(id: number) {
    return this.prisma.payment.updateMany({
      where: { id, refundRequestedAt: null, sale: { status: 'CANCELLED' } },
      data: { refundRequestedAt: new Date(), stripeRefundStatus: 'requested' },
    });
  }

  async recordRefund(
    id: number,
    stripeRefundId: string,
    stripeRefundStatus: string,
  ) {
    // Terminal success cannot be overwritten by an older in-flight response.
    await this.prisma.payment.updateMany({
      where: {
        id,
        OR: [
          { stripeRefundStatus: null },
          { stripeRefundStatus: { not: 'succeeded' } },
        ],
      },
      data: {
        stripeRefundId,
        stripeRefundStatus,
        lastStripeSyncAt: new Date(),
        ...(stripeRefundStatus === 'succeeded'
          ? { status: 'REFUNDED' as const }
          : {}),
      },
    });
  }

  pendingSync(afterId: number) {
    return this.prisma.payment.findMany({
      where: {
        id: { gt: afterId },
        stripeIntentId: { not: null },
        OR: [
          { status: 'PENDING' },
          {
            status: 'VOIDED',
            OR: [{ stripeStatus: null }, { stripeStatus: { not: 'canceled' } }],
            stripeRefundStatus: null,
          },
          {
            refundRequestedAt: { not: null },
            stripeRefundStatus: {
              in: ['requested', 'pending', 'requires_action'],
            },
          },
        ],
      },
      select: { id: true, stripeIntentId: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
  }
}
