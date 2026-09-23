import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import {
  getMessaging,
  type Messaging,
  type MulticastMessage,
} from 'firebase-admin/messaging';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import type { RegisterPushTokenDto } from './dto/push-token.dto.js';

const APP_NAME = 'fashionstore-push';
/** FCM acepta como maximo 500 dispositivos por envio multicast. */
const LOTE = 500;
/** Errores que indican que el dispositivo ya no existe: se borra su token. */
const TOKENS_INVALIDOS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

type RoleName = 'ADMINISTRATOR' | 'BRANCH_MANAGER' | 'CASHIER';

/** Pantalla de ventas que abre la notificacion segun el rol de quien la recibe. */
const RUTA_POR_ROL: [RoleName, string][] = [
  ['ADMINISTRATOR', '/admin/ventas'],
  ['BRANCH_MANAGER', '/sucursal/ventas'],
  ['CASHIER', '/caja/ventas'],
];

/**
 * Notificaciones push con Firebase Cloud Messaging.
 *
 * Avisa al personal (administradores de todas las sucursales; encargados y
 * cajeros de la sucursal de la venta) cuando un cliente compra por la web o la
 * app. Sin credenciales de Firebase queda desactivado y la venta sigue igual:
 * un fallo del aviso nunca afecta la compra.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  /** undefined: aun no se inicializo; null: sin credenciales. */
  private messaging?: Messaging | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get<string>('FIREBASE_PROJECT_ID') &&
      this.config.get<string>('FIREBASE_CLIENT_EMAIL') &&
      this.config.get<string>('FIREBASE_PRIVATE_KEY'),
    );
  }

  status() {
    return { enabled: this.enabled };
  }

  async register(userId: number, dto: RegisterPushTokenDto) {
    // Un navegador puede cambiar de usuario: el token queda con el ultimo que inicio sesion.
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform ?? 'WEB' },
      update: { userId, platform: dto.platform ?? 'WEB' },
    });
    return { registered: true };
  }

  async unregister(userId: number, token: string) {
    const { count } = await this.prisma.pushToken.deleteMany({
      where: { token, userId },
    });
    return { removed: count > 0 };
  }

  /** Aviso de compra de un cliente. Nunca lanza errores. */
  async notifySale(saleId: number): Promise<void> {
    try {
      const messaging = this.client();
      if (!messaging) return;
      const sale = await this.prisma.sale.findUnique({
        where: { id: saleId },
        select: {
          id: true,
          branchId: true,
          channel: true,
          cashOnDelivery: true,
          total: true,
          currency: true,
          branch: { select: { name: true } },
          client: { select: { user: { select: { name: true } } } },
          items: {
            select: {
              quantity: true,
              productName: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!sale?.branchId) return;

      const destinos = await this.prisma.pushToken.findMany({
        where: {
          user: {
            active: true,
            OR: [
              { roles: { some: { role: { name: 'ADMINISTRATOR' } } } },
              {
                employee: { active: true, branchId: sale.branchId },
                roles: {
                  some: {
                    role: { name: { in: ['BRANCH_MANAGER', 'CASHIER'] } },
                  },
                },
              },
            ],
          },
        },
        select: {
          token: true,
          user: {
            select: { roles: { select: { role: { select: { name: true } } } } },
          },
        },
      });
      if (!destinos.length) return;

      const { title, body } = saleMessage(sale);
      // Se agrupa por pantalla de destino: cada rol abre su propia lista de ventas.
      const porRuta = new Map<string, string[]>();
      for (const d of destinos) {
        const roles = d.user.roles.map((r) => r.role.name as string);
        const ruta =
          RUTA_POR_ROL.find(([rol]) => roles.includes(rol))?.[1] ??
          '/caja/ventas';
        porRuta.set(ruta, [...(porRuta.get(ruta) ?? []), d.token]);
      }

      const invalidos: string[] = [];
      for (const [url, tokens] of porRuta)
        for (let i = 0; i < tokens.length; i += LOTE) {
          const lote = tokens.slice(i, i + LOTE);
          const message: MulticastMessage = {
            tokens: lote,
            notification: { title, body },
            data: { tipo: 'VENTA', saleId: String(sale.id), url },
            webpush: {
              headers: { Urgency: 'high' },
              notification: { icon: '/pwa-icon.svg', tag: `venta-${sale.id}` },
            },
            android: { priority: 'high' },
          };
          const res = await messaging.sendEachForMulticast(message);
          res.responses.forEach((r, j) => {
            if (!r.success && r.error && TOKENS_INVALIDOS.has(r.error.code))
              invalidos.push(lote[j]!);
          });
        }
      if (invalidos.length)
        await this.prisma.pushToken.deleteMany({
          where: { token: { in: invalidos } },
        });
    } catch (error) {
      this.logger.warn(
        `Push notification for sale ${saleId} failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private client(): Messaging | null {
    if (this.messaging !== undefined) return this.messaging;
    if (!this.enabled) return (this.messaging = null);
    const app =
      getApps().find((a) => a.name === APP_NAME) ??
      initializeApp(
        {
          credential: cert({
            projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
            clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
            // En variables de entorno los saltos de linea llegan como "\n" literal.
            privateKey: this.config
              .get<string>('FIREBASE_PRIVATE_KEY')!
              .replace(/\\n/g, '\n'),
          }),
        },
        APP_NAME,
      );
    return (this.messaging = getMessaging(app));
  }
}

interface SaleSummary {
  id: number;
  channel: string;
  cashOnDelivery: boolean;
  total: { toString(): string };
  currency: string;
  branch: { name: string } | null;
  client: { user: { name: string } } | null;
  items: {
    quantity: number;
    productName: string | null;
    product: { name: string };
  }[];
}

/** Texto del aviso: quien compro, que prendas, cuanto y en que sucursal. */
export function saleMessage(sale: SaleSummary) {
  const unidades = sale.items.reduce((suma, item) => suma + item.quantity, 0);
  const nombres = sale.items.map((item) => {
    const nombre = item.productName ?? item.product.name;
    return item.quantity > 1 ? `${nombre} x${item.quantity}` : nombre;
  });
  const prendas =
    nombres.length > 2
      ? `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} mas`
      : nombres.join(' y ');
  const monto = `${sale.currency === 'BOB' ? 'Bs' : sale.currency} ${Number(sale.total.toString()).toFixed(2)}`;
  const canal = sale.channel === 'MOBILE' ? 'app' : 'web';
  const cliente = sale.client?.user.name ?? 'Un cliente';
  return {
    title: sale.cashOnDelivery
      ? `Nuevo pedido contra entrega (${canal})`
      : `Nueva compra pagada (${canal})`,
    body: `${cliente} compro ${unidades} ${unidades === 1 ? 'prenda' : 'prendas'}: ${prendas}. ${monto}${sale.branch ? ` - ${sale.branch.name}` : ''}`,
  };
}
