import type { PushService } from '../push/push.service.js';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../common/enums/role.enum.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SalesRepository } from './sales.repository.js';
import { SalesService } from './sales.service.js';
import { CreateInStoreSaleDto } from './dto/create-in-store-sale.dto.js';

describe('SalesService', () => {
  const cashier = { id: 2, email: 'cashier@test.local', roles: [Role.CASHIER] };
  const customer = {
    id: 1,
    email: 'customer@test.local',
    roles: [Role.CUSTOMER],
  };
  const item = { productId: 1, sizeId: 1, colorId: 1, quantity: 2 };
  const dto: CreateInStoreSaleDto = {
    shiftId: 1,
    branchId: 1,
    items: [item],
    expectedTotal: 20,
    paymentMethod: 'CASH',
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
  };
  const repository = {
    transaction: vi.fn(),
    recordShiftSale: vi.fn(),
    requireOnlineShift: vi.fn(),
    findEmployee: vi.fn(),
    findClient: vi.fn(),
    findClientById: vi.fn(),
    findCart: vi.fn(),
    convertCart: vi.fn(),
    findBranch: vi.fn(),
    findRequest: vi.fn(),
    findStock: vi.fn(),
    create: vi.fn(),
    changeStock: vi.fn(),
    movement: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    updatePayment: vi.fn(),
    findExpired: vi.fn(),
    findAll: vi.fn(),
  };
  const push = { notifySale: vi.fn(), notifyCustomerSale: vi.fn() };
  const service = new SalesService(
    repository as unknown as SalesRepository,
    new ConfigService({ SALES_CURRENCY: 'BOB' }),
    push as unknown as PushService,
  );
  let pending: Record<string, unknown>;

  beforeEach(() => {
    vi.resetAllMocks();
    repository.transaction.mockImplementation((fn) => fn({}));
    repository.findEmployee.mockResolvedValue({
      id: 7,
      branchId: 1,
      active: true,
    });
    repository.findClient.mockResolvedValue({ id: 3 });
    repository.findBranch.mockResolvedValue({ active: true });
    repository.findRequest.mockResolvedValue(null);
    repository.findStock.mockResolvedValue({
      id: 5,
      physicalQuantity: 5,
      reservedQuantity: 2,
      product: {
        name: 'Camisa',
        price: new Prisma.Decimal(10),
        discountPercent: new Prisma.Decimal(0),
        promotionStart: null,
        promotionEnd: null,
      },
      size: { name: 'M' },
      color: { name: 'Azul' },
    });
    pending = {
      id: 9,
      branchId: 1,
      channel: 'WEB',
      status: 'PENDING_PAYMENT',
      stockReserved: true,
      expiresAt: new Date('2035-01-01'),
      currency: 'BOB',
      total: new Prisma.Decimal(20),
      client: { userId: 1 },
      items: [
        {
          ...item,
          unitPrice: new Prisma.Decimal(10),
          discount: new Prisma.Decimal(0),
        },
      ],
      payments: [
        {
          id: 8,
          type: 'ELECTRONIC',
          amount: new Prisma.Decimal(20),
          status: 'PENDING',
        },
      ],
    };
    repository.findById.mockImplementation(async () => pending);
    repository.create.mockResolvedValue({
      ...pending,
      channel: 'IN_STORE',
      status: 'COMPLETED',
    });
    repository.update.mockImplementation(async (_id, data) => ({
      ...pending,
      ...data,
    }));
  });

  it('records the computed cash payment and inventory movement together', async () => {
    await service.createInStore(dto, cashier);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        employeeId: 7,
        total: new Prisma.Decimal(20),
        currency: 'BOB',
      }),
      expect.anything(),
    );
    expect(repository.changeStock).toHaveBeenCalledWith(
      expect.anything(),
      -2,
      0,
      expect.anything(),
    );
  });

  it('prices an in-store sale using the selected customer tier', async () => {
    repository.findClientById.mockResolvedValue({ id: 3, wholesale: true });
    const stock = await repository.findStock();
    stock.product.wholesalePrice = new Prisma.Decimal(8);
    await service.createInStore(
      { ...dto, clientId: 3, expectedTotal: 16 },
      cashier,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ total: new Prisma.Decimal(16) }),
      expect.anything(),
    );
  });

  it('changes the checkout quote when a customer changes tier', async () => {
    const stock = await repository.findStock();
    stock.product.wholesalePrice = new Prisma.Decimal(8);
    const cart = {
      id: 4,
      updatedAt: new Date(),
      items: [item],
      client: { wholesale: true },
    };
    repository.findCart.mockResolvedValue(cart);
    const wholesale = await service.previewCheckout(
      { cartId: 4, branchId: 1 },
      customer,
    );
    cart.client.wholesale = false;
    const retail = await service.previewCheckout(
      { cartId: 4, branchId: 1 },
      customer,
    );
    expect(wholesale.total).toBe(16);
    expect(retail.total).toBe(20);
    expect(wholesale.quoteHash).not.toBe(retail.quoteHash);
  });

  it('rejects customer cash sales, wrong branches and mismatched totals', async () => {
    await expect(service.createInStore(dto, customer)).rejects.toThrow(
      'cashier',
    );
    await expect(
      service.createInStore({ ...dto, branchId: 2 }, cashier),
    ).rejects.toThrow('assigned branch');
    await expect(
      service.createInStore({ ...dto, expectedTotal: 1 }, cashier),
    ).rejects.toThrow('Prices changed');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('requires a reference for externally collected non-cash payments', async () => {
    await expect(
      service.createInStore({ ...dto, paymentMethod: 'QR' }, cashier),
    ).rejects.toThrow('paymentReference');
  });

  it('rejects reusing an idempotency key with a different request', async () => {
    repository.findRequest.mockResolvedValue({
      ...pending,
      requestHash: 'different',
    });
    await expect(service.createInStore(dto, cashier)).rejects.toThrow(
      'different request',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects provider confirmations with an incorrect amount or currency', async () => {
    await expect(
      service.confirmElectronicPayment(9, {
        amount: '1',
        currency: 'BOB',
        reference: 'payment_1',
      }),
    ).rejects.toThrow('does not match');
    await expect(
      service.confirmElectronicPayment(9, {
        amount: '20',
        currency: 'USD',
        reference: 'payment_1',
      }),
    ).rejects.toThrow('does not match');
    expect(repository.changeStock).not.toHaveBeenCalled();
  });

  it('consumes the checkout hold only after a verified confirmation', async () => {
    await service.confirmElectronicPayment(9, {
      amount: '20.00',
      currency: 'BOB',
      reference: 'payment_1',
    });
    expect(repository.changeStock).toHaveBeenCalledWith(
      expect.anything(),
      -2,
      -2,
      expect.anything(),
    );
    expect(repository.updatePayment).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        status: 'APPROVED',
        externalReference: 'GATEWAY:payment_1',
      }),
      expect.anything(),
    );
  });

  it('releases expired holds before rejecting late provider approval', async () => {
    pending.expiresAt = new Date('2000-01-01');
    await expect(
      service.confirmElectronicPayment(9, {
        amount: '20',
        currency: 'BOB',
        reference: 'payment_1',
      }),
    ).rejects.toThrow('after expiration');
    expect(repository.changeStock).toHaveBeenCalledWith(
      expect.anything(),
      0,
      -2,
      expect.anything(),
    );
    expect(repository.update).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.anything(),
    );
  });

  it('does not cancel completed sales through the unpaid cancellation endpoint', async () => {
    pending.status = 'COMPLETED';
    await expect(service.cancel(9, customer)).rejects.toThrow('refund');
    expect(repository.changeStock).not.toHaveBeenCalled();
  });

  it('repeated cancellations do not release stock twice', async () => {
    pending.status = 'CANCELLED';
    pending.stockReserved = false;
    await service.cancel(9, customer);
    expect(repository.changeStock).not.toHaveBeenCalled();
  });

  it('rechecks state when expiration races with payment confirmation', async () => {
    repository.findExpired.mockResolvedValue([{ id: 9 }]);
    pending.status = 'COMPLETED';
    pending.stockReserved = false;
    expect(await service.expirePendingCheckouts(new Date('2040-01-01'))).toBe(
      0,
    );
    expect(repository.changeStock).not.toHaveBeenCalled();
  });
  it('notifies a verified payment once, including webhook replays', async () => {
    const confirmation = {
      amount: '20',
      currency: 'BOB',
      reference: 'payment_1',
    };
    await service.confirmElectronicPayment(9, confirmation);
    expect(push.notifyCustomerSale).toHaveBeenCalledWith(
      9,
      'PAYMENT_CONFIRMED',
    );
    pending.status = 'COMPLETED';
    pending.payments = [
      {
        id: 8,
        type: 'ELECTRONIC',
        amount: new Prisma.Decimal(20),
        status: 'APPROVED',
        externalReference: 'GATEWAY:payment_1',
      },
    ];
    await service.confirmElectronicPayment(9, confirmation);
    expect(push.notifyCustomerSale).toHaveBeenCalledTimes(1);
  });

  it('notifies delivery only after a new committed collection', async () => {
    pending.cashOnDelivery = true;
    pending.payments = [
      {
        id: 8,
        method: 'CASH',
        type: 'IN_STORE',
        amount: new Prisma.Decimal(20),
        status: 'PENDING',
      },
    ];
    repository.transaction.mockImplementation((fn) =>
      fn({ cashShift: { findUnique: async () => ({ userId: cashier.id }) } }),
    );
    await service.deliver(9, { shiftId: 1, expectedTotal: 20 }, cashier);
    expect(push.notifyCustomerSale).toHaveBeenCalledWith(9, 'ORDER_DELIVERED');
    pending.status = 'COMPLETED';
    pending.shiftId = 1;
    pending.payments = [
      {
        id: 8,
        method: 'CASH',
        type: 'IN_STORE',
        amount: new Prisma.Decimal(20),
        status: 'APPROVED',
      },
    ];
    await service.deliver(9, { shiftId: 1, expectedTotal: 20 }, cashier);
    expect(push.notifyCustomerSale).toHaveBeenCalledTimes(1);
  });

  it('does not notify an aborted checkout attempt when the retry finds a replay', async () => {
    repository.findCart.mockResolvedValue({
      id: 4,
      updatedAt: new Date(),
      items: [item],
      client: { wholesale: false },
    });
    const quote = await service.previewCheckout(
      { cartId: 4, branchId: 1 },
      customer,
    );
    repository.create.mockImplementation(async (data) => ({
      ...pending,
      requestHash: data.requestHash,
    }));
    repository.transaction.mockImplementation(async (fn) => {
      const discarded = await fn({});
      repository.findRequest.mockResolvedValue(discarded.sale);
      return fn({});
    });
    await service.checkout(
      {
        cartId: 4,
        branchId: 1,
        channel: 'MOBILE',
        quoteHash: quote.quoteHash,
        idempotencyKey: dto.idempotencyKey,
        paymentOption: 'CASH_ON_DELIVERY',
        deliveryName: 'Cliente',
        deliveryPhone: '70000000',
        deliveryAddress: 'Direccion de ejemplo',
      },
      customer,
    );
    expect(push.notifyCustomerSale).not.toHaveBeenCalled();
    expect(push.notifySale).not.toHaveBeenCalled();
  });
});
