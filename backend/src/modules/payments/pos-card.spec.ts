import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { SalesService } from '../sales/sales.service.js';
import type { PaymentGatewayService } from './payment-gateway.service.js';
import type { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

const cashier = { id: 7, roles: [Role.CASHIER] } as unknown as AuthenticatedUser;
const ticket = {
  branchId: 2,
  items: [{ productId: 1, sizeId: 1, colorId: 1, quantity: 2 }],
  shiftId: 5,
  idempotencyKey: '79c39c8c-54ad-4844-a3d1-cbc8866a8d90',
  expectedTotal: 160,
};
const intent = (over: Record<string, unknown> = {}) => ({
  id: 'pi_1',
  status: 'requires_capture',
  livemode: false,
  amount: 16000,
  currency: 'bob',
  client_secret: 'pi_1_secret',
  metadata: {
    application: 'fashionstore',
    kind: 'pos',
    userId: '7',
    shiftId: '5',
    saleKey: ticket.idempotencyKey,
  },
  ...over,
});

function setup(sale: () => Promise<unknown>) {
  const gateway = {
    isConfigured: vi.fn(() => true),
    publicConfig: vi.fn(() => ({ publishableKey: 'pk_test' })),
    createPosIntent: vi.fn(async () => intent()),
    retrieveIntent: vi.fn(async () => intent()),
    captureIntent: vi.fn(async () => intent({ status: 'succeeded' })),
    cancelIntent: vi.fn(async () => intent({ status: 'canceled' })),
  };
  const sales = {
    previewInStore: vi.fn(async () => ({ total: 160, currency: 'BOB' })),
    createInStore: vi.fn(sale),
  };
  const service = new PaymentsService(
    gateway as unknown as PaymentGatewayService,
    {} as PaymentsRepository,
    sales as unknown as SalesService,
  );
  return { service, gateway, sales };
}

describe('Cobro con tarjeta en caja', () => {
  it('authorizes the reviewed total with manual capture bound to the cashier, shift and ticket', async () => {
    const { service, gateway } = setup(async () => ({}));
    const result = await service.createPosCardIntent(ticket, cashier);
    expect(gateway.createPosIntent).toHaveBeenCalledWith({
      amount: 16000,
      currency: 'BOB',
      requestKey: `${ticket.idempotencyKey}:16000`,
      metadata: {
        kind: 'pos',
        userId: '7',
        shiftId: '5',
        branchId: '2',
        saleKey: ticket.idempotencyKey,
      },
    });
    expect(result).toMatchObject({ paymentIntentId: 'pi_1', clientSecret: 'pi_1_secret' });
  });
  it('refuses to authorize a total that changed since the review', async () => {
    const { service, gateway } = setup(async () => ({}));
    await expect(
      service.createPosCardIntent({ ...ticket, expectedTotal: 150 }, cashier),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.createPosIntent).not.toHaveBeenCalled();
  });
  it('records the sale as a verified card payment and only then captures the money', async () => {
    const { service, gateway, sales } = setup(async () => ({ id: 90 }));
    const sale = await service.chargePosCard({ ...ticket, paymentIntentId: 'pi_1' }, cashier);
    expect(sale).toEqual({ id: 90 });
    expect(sales.createInStore).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'CARD', paymentReference: 'pi_1' }),
      cashier,
      { cardVerified: true },
    );
    expect(gateway.captureIntent).toHaveBeenCalledWith('pi_1');
    expect(sales.createInStore.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.captureIntent.mock.invocationCallOrder[0],
    );
  });
  it('releases the authorization when the sale is rejected (stock, price or closed caja)', async () => {
    const { service, gateway } = setup(async () => {
      throw new ConflictException('Insufficient stock');
    });
    await expect(
      service.chargePosCard({ ...ticket, paymentIntentId: 'pi_1' }, cashier),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.cancelIntent).toHaveBeenCalledWith('pi_1');
    expect(gateway.captureIntent).not.toHaveBeenCalled();
  });
  it('rejects intents of another cashier, ticket or amount and unauthorized cards', async () => {
    for (const over of [
      { metadata: { ...intent().metadata, userId: '8' } },
      { metadata: { ...intent().metadata, saleKey: 'otro' } },
      { amount: 1000 },
      { livemode: true },
    ]) {
      const { service, gateway, sales } = setup(async () => ({}));
      gateway.retrieveIntent.mockResolvedValue(intent(over));
      await expect(
        service.chargePosCard({ ...ticket, paymentIntentId: 'pi_1' }, cashier),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sales.createInStore).not.toHaveBeenCalled();
    }
    const { service, gateway } = setup(async () => ({}));
    gateway.retrieveIntent.mockResolvedValue(intent({ status: 'requires_payment_method' }));
    await expect(
      service.chargePosCard({ ...ticket, paymentIntentId: 'pi_1' }, cashier),
    ).rejects.toThrow('not authorized');
  });
});
