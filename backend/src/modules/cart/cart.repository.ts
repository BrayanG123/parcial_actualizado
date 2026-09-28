import { ConflictException, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';

const cartProductSelect = {
  id: true,
  name: true,
  imageUrl: true,
  active: true,
  price: true,
  wholesalePrice: true,
  discountPercent: true,
  promotionStart: true,
  promotionEnd: true,
  sizes: { select: { sizeId: true } },
  colors: { select: { colorId: true } },
} satisfies Prisma.ProductSelect;

const cartInclude = {
  client: { select: { wholesale: true } },
  items: {
    include: {
      product: { select: cartProductSelect },
      size: true,
      color: true,
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

export type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartProduct = Prisma.ProductGetPayload<{
  select: typeof cartProductSelect;
}>;
export interface CartVariant {
  productId: number;
  sizeId: number;
  colorId: number;
}

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        });
      } catch (error) {
        // P2002 also covers two simultaneous attempts to create the first active cart.
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)
        )
          throw error;
        if (attempt >= 3)
          throw new ConflictException(
            'Cart changed concurrently; retry the operation',
          );
        await delay(25 * (attempt + 1));
      }
    }
  }

  findClient(userId: number, tx: Prisma.TransactionClient) {
    return tx.client.findFirst({
      where: { userId, user: { active: true } },
      select: { id: true },
    });
  }

  findActive(clientId: number, tx: Prisma.TransactionClient) {
    return tx.cart.findFirst({
      where: { clientId, status: 'ACTIVE' },
      include: cartInclude,
    });
  }

  createActive(clientId: number, tx: Prisma.TransactionClient) {
    return tx.cart.create({ data: { clientId }, include: cartInclude });
  }

  findById(id: number, tx: Prisma.TransactionClient) {
    return tx.cart.findUniqueOrThrow({ where: { id }, include: cartInclude });
  }

  findProduct(id: number, tx: Prisma.TransactionClient) {
    return tx.product.findUnique({ where: { id }, select: cartProductSelect });
  }

  findInventory(variants: CartVariant[], tx: Prisma.TransactionClient) {
    return tx.inventory.findMany({
      where: {
        branch: { active: true },
        OR: variants.map(({ productId, sizeId, colorId }) => ({
          productId,
          sizeId,
          colorId,
        })),
      },
      select: {
        productId: true,
        sizeId: true,
        colorId: true,
        physicalQuantity: true,
        reservedQuantity: true,
        branch: { select: { id: true, name: true, city: true } },
      },
      orderBy: { branchId: 'asc' },
    });
  }

  async saveItem(
    cartId: number,
    variant: CartVariant,
    quantity: number,
    unitPrice: Prisma.Decimal,
    tx: Prisma.TransactionClient,
  ) {
    await tx.cartItem.upsert({
      where: { cartId_productId_sizeId_colorId: { cartId, ...variant } },
      create: { cartId, ...variant, quantity, unitPrice },
      update: { quantity, unitPrice },
    });
    await this.touch(cartId, tx);
  }

  async removeItem(
    cartId: number,
    itemId: number,
    tx: Prisma.TransactionClient,
  ) {
    await tx.cartItem.deleteMany({ where: { cartId, id: itemId } });
    await this.touch(cartId, tx);
  }

  async clear(cartId: number, tx: Prisma.TransactionClient) {
    await tx.cartItem.deleteMany({ where: { cartId } });
    await this.touch(cartId, tx);
  }

  private touch(id: number, tx: Prisma.TransactionClient) {
    // A parent-row write serializes all cart edits, including edits to different lines.
    return tx.cart.update({ where: { id }, data: { updatedAt: new Date() } });
  }
}
