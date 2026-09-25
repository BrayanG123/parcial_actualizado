import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import { PushService } from './push.service.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(),
  getApps: () => [],
  initializeApp: vi.fn(),
}));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: send }),
}));

describe('Customer Android push', () => {
  const config = new ConfigService({
    FIREBASE_PROJECT_ID: 'test',
    FIREBASE_CLIENT_EMAIL: 'test@example.test',
    FIREBASE_PRIVATE_KEY: 'test',
  });
  let db: ReturnType<typeof database>;
  let service: PushService;
  function database() {
    return {
      sale: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            status: 'COMPLETED',
            channel: 'MOBILE',
            cashOnDelivery: false,
            client: { userId: 7 },
          }),
      },
      reservation: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ status: 'READY', client: { userId: 7 } }),
      },
      pushToken: {
        findMany: vi.fn().mockResolvedValue([{ token: 'android-a' }]),
        deleteMany: vi.fn(),
      },
    };
  }
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ responses: [{ success: true }] });
    db = database();
    service = new PushService(db as unknown as PrismaService, config);
  });
  it('targets only active customer Android devices of the owner', async () => {
    await service.notifyCustomerSale(42, 'PAYMENT_CONFIRMED');
    expect(db.pushToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        platform: 'ANDROID',
        user: { active: true, roles: { some: { role: { name: 'CUSTOMER' } } } },
      },
      select: { token: true },
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['android-a'],
        data: {
          tipo: 'COMPRA_CLIENTE',
          saleId: '42',
          userId: '7',
          event: 'PAYMENT_CONFIRMED',
          eventId: 'sale-42-PAYMENT_CONFIRMED',
        },
        android: expect.objectContaining({
          notification: expect.objectContaining({
            channelId: 'customer-updates',
          }),
        }),
      }),
    );
  });
  it('does not report payment success on unpaid or cancelled sales', async () => {
    for (const status of ['PENDING_PAYMENT', 'CANCELLED']) {
      db.sale.findUnique.mockResolvedValue({
        status,
        channel: 'MOBILE',
        cashOnDelivery: false,
        client: { userId: 7 },
      });
      await service.notifyCustomerSale(42, 'PAYMENT_CONFIRMED');
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('distinguishes cash-on-delivery creation and delivery', async () => {
    db.sale.findUnique.mockResolvedValue({
      status: 'PENDING_PAYMENT',
      channel: 'WEB',
      cashOnDelivery: true,
      client: { userId: 7 },
    });
    await service.notifyCustomerSale(42, 'ORDER_PLACED');
    expect(send.mock.calls[0][0].notification.title).toBe('Pedido registrado');
    db.sale.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      channel: 'WEB',
      cashOnDelivery: true,
      client: { userId: 7 },
    });
    await service.notifyCustomerSale(42, 'ORDER_DELIVERED');
    expect(send.mock.calls[1][0].notification.title).toBe('Entrega confirmada');
  });
  it('sends ready, cancelled and expired reservations, suppressing stale events', async () => {
    for (const status of ['READY', 'CANCELLED', 'EXPIRED'] as const) {
      db.reservation.findUnique.mockResolvedValue({
        status,
        client: { userId: 7 },
      });
      await service.notifyCustomerReservation(4, status);
    }
    expect(send).toHaveBeenCalledTimes(3);
    await service.notifyCustomerReservation(4, 'READY');
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('removes unregistered tokens but not tokens with a payload error', async () => {
    db.pushToken.findMany.mockResolvedValue([
      { token: 'old' },
      { token: 'valid' },
    ]);
    send.mockResolvedValue({
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: false, error: { code: 'messaging/invalid-argument' } },
      ],
    });
    await service.notifyCustomerReservation(4, 'READY');
    expect(db.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, token: { in: ['old'] } },
    });
  });
  it('does not propagate Firebase failures to the operation', async () => {
    send.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.notifyCustomerSale(42, 'PAYMENT_CONFIRMED'),
    ).resolves.toBeUndefined();
    await expect(
      service.notifyCustomerReservation(4, 'READY'),
    ).resolves.toBeUndefined();
  });
  it('batches more than 500 devices', async () => {
    db.pushToken.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({ token: String(i) })),
    );
    await service.notifyCustomerReservation(4, 'READY');
    expect(send.mock.calls.map(([message]) => message.tokens.length)).toEqual([
      500, 1,
    ]);
  });
});
