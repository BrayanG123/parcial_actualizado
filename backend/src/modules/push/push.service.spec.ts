import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma/prisma.service.js';
import { PushService, saleMessage } from './push.service.js';

const send = vi.fn();
vi.mock('firebase-admin/app', () => ({
  cert: vi.fn((c: unknown) => c),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: 'fashionstore-push' })),
}));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({ sendEachForMulticast: send })),
}));

const config = (enabled: boolean) =>
  ({
    get: (key: string) =>
      enabled
        ? {
            FIREBASE_PROJECT_ID: 'shoping-a72ce',
            FIREBASE_CLIENT_EMAIL: 'push@shoping-a72ce.iam.gserviceaccount.com',
            FIREBASE_PRIVATE_KEY:
              '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
          }[key]
        : undefined,
  }) as unknown as ConfigService;

const sale = {
  id: 42,
  branchId: 3,
  channel: 'WEB',
  cashOnDelivery: false,
  total: { toString: () => '349.9' },
  currency: 'BOB',
  branch: { name: 'Sucursal Centro' },
  client: { user: { name: 'Ana Rojas' } },
  items: [
    {
      quantity: 2,
      productName: 'Camisa Oxford',
      product: { name: 'Camisa Oxford' },
    },
    { quantity: 1, productName: null, product: { name: 'Jean Slim' } },
  ],
};

const rol = (name: string) => ({ role: { name } });

function prisma(
  tokens: { token: string; user: { roles: { role: { name: string } }[] } }[],
) {
  return {
    sale: { findUnique: vi.fn().mockResolvedValue(sale) },
    pushToken: {
      findMany: vi.fn().mockResolvedValue(tokens),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService & {
    pushToken: {
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
}

describe('PushService', () => {
  beforeEach(() => send.mockReset());

  it('describes who bought what, how much and where', () => {
    expect(saleMessage(sale)).toEqual({
      title: 'Nueva compra pagada (web)',
      body: 'Ana Rojas compro 3 prendas: Camisa Oxford x2 y Jean Slim. Bs 349.90 - Sucursal Centro',
    });
    expect(
      saleMessage({ ...sale, cashOnDelivery: true, channel: 'MOBILE' }).title,
    ).toBe('Nuevo pedido contra entrega (app)');
  });

  it('does nothing without Firebase credentials', async () => {
    const db = prisma([]);
    const service = new PushService(db, config(false));
    await service.notifySale(42);
    expect(service.status()).toEqual({ enabled: false });
    expect(db.pushToken.findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('notifies admins, managers and cashiers of the branch, each to their sales screen', async () => {
    send.mockResolvedValue({ responses: [{ success: true }] });
    const db = prisma([
      {
        token: 'token-admin-000000000000',
        user: { roles: [rol('ADMINISTRATOR')] },
      },
      { token: 'token-cajero-00000000000', user: { roles: [rol('CASHIER')] } },
    ]);
    await new PushService(db, config(true)).notifySale(42);

    // Solo personal de la sucursal de la venta (o administradores de todas).
    const filtro = db.pushToken.findMany.mock.calls[0][0].where.user.OR;
    expect(filtro[1].employee).toEqual({ active: true, branchId: 3 });
    const urls = send.mock.calls.map(([m]) => [m.data.url, m.tokens]);
    expect(urls).toEqual([
      ['/admin/ventas', ['token-admin-000000000000']],
      ['/caja/ventas', ['token-cajero-00000000000']],
    ]);
    expect(send.mock.calls[0][0].notification.title).toBe(
      'Nueva compra pagada (web)',
    );
  });

  it('removes tokens of devices that no longer exist and never throws', async () => {
    send.mockResolvedValue({
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: true },
      ],
    });
    const db = prisma([
      {
        token: 'token-viejo-000000000000',
        user: { roles: [rol('BRANCH_MANAGER')] },
      },
      {
        token: 'token-nuevo-000000000000',
        user: { roles: [rol('BRANCH_MANAGER')] },
      },
    ]);
    await new PushService(db, config(true)).notifySale(42);
    expect(db.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['token-viejo-000000000000'] } },
    });

    // Un fallo de Firebase no debe propagarse a la venta.
    const caido = {
      sendEachForMulticast: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const servicio = new PushService(db, config(true));
    (servicio as unknown as { messaging: unknown }).messaging = caido;
    await expect(servicio.notifySale(42)).resolves.toBeUndefined();
    expect(caido.sendEachForMulticast).toHaveBeenCalled();
  });
});
