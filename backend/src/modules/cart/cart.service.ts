import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { productPrice } from '../../common/utils/product-price.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CartRepository } from './cart.repository.js';
import type {
  CartProduct,
  CartRecord,
  CartVariant,
} from './cart.repository.js';

@Injectable()
export class CartService {
  constructor(private readonly cartRepository: CartRepository) {}

  getActive(user: AuthenticatedUser) {
    return this.withCart(user, async (cart, tx) => this.present(cart, tx));
  }

  addItem(dto: AddCartItemDto, user: AuthenticatedUser) {
    return this.withCart(user, async (cart, tx) => {
      const existing = cart.items.find((item) => this.sameVariant(item, dto));
      if (!existing && cart.items.length >= 50)
        throw new BadRequestException('A cart can contain at most 50 variants');
      const quantity = (existing?.quantity ?? 0) + dto.quantity;
      return this.save(cart, dto, quantity, tx);
    });
  }

  updateItem(itemId: number, dto: UpdateCartItemDto, user: AuthenticatedUser) {
    return this.withCart(user, async (cart, tx) => {
      const item = this.requireItem(cart, itemId);
      return this.save(cart, item, dto.quantity, tx);
    });
  }

  removeItem(itemId: number, user: AuthenticatedUser) {
    return this.withCart(user, async (cart, tx) => {
      this.requireItem(cart, itemId);
      await this.cartRepository.removeItem(cart.id, itemId, tx);
      return this.present(await this.cartRepository.findById(cart.id, tx), tx);
    });
  }

  clear(user: AuthenticatedUser) {
    return this.withCart(user, async (cart, tx) => {
      await this.cartRepository.clear(cart.id, tx);
      return this.present(await this.cartRepository.findById(cart.id, tx), tx);
    });
  }

  private async withCart<T>(
    user: AuthenticatedUser,
    action: (cart: CartRecord, tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (!user.roles.includes(Role.CUSTOMER))
      throw new ForbiddenException('A customer role is required');
    return this.cartRepository.transaction(async (tx) => {
      const client = await this.cartRepository.findClient(user.id, tx);
      if (!client)
        throw new ForbiddenException('An active customer profile is required');
      const cart =
        (await this.cartRepository.findActive(client.id, tx)) ??
        (await this.cartRepository.createActive(client.id, tx));
      return action(cart, tx);
    });
  }

  private async save(
    cart: CartRecord,
    variant: CartVariant,
    quantity: number,
    tx: Prisma.TransactionClient,
  ) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new BadRequestException(
        'Quantity per variant must be between 1 and 100',
      );
    }
    const product = await this.cartRepository.findProduct(
      variant.productId,
      tx,
    );
    if (!product) throw new NotFoundException('Product was not found');
    if (!this.validVariant(product, variant))
      throw new ConflictException('Product or variant is no longer available');
    const inventory = await this.cartRepository.findInventory([variant], tx);
    if (
      !inventory.some(
        (entry) => entry.physicalQuantity - entry.reservedQuantity >= quantity,
      )
    ) {
      throw new ConflictException(
        'No active branch has enough available stock for this variant',
      );
    }
    await this.cartRepository.saveItem(
      cart.id,
      {
        productId: variant.productId,
        sizeId: variant.sizeId,
        colorId: variant.colorId,
      },
      quantity,
      productPrice(product, new Date(), cart.client?.wholesale).currentPrice,
      tx,
    );
    return this.present(await this.cartRepository.findById(cart.id, tx), tx);
  }

  private async present(cart: CartRecord, tx: Prisma.TransactionClient) {
    const inventory = cart.items.length
      ? await this.cartRepository.findInventory(cart.items, tx)
      : [];
    const now = new Date();
    let total = new Prisma.Decimal(0);
    const items = cart.items.map((item) => {
      const pricing = productPrice(item.product, now, cart.client?.wholesale);
      const valid = this.validVariant(item.product, item);
      const availability = valid
        ? inventory
            .filter((entry) => this.sameVariant(entry, item))
            .map((entry) => ({
              branch: entry.branch,
              availableQuantity: Math.max(
                0,
                entry.physicalQuantity - entry.reservedQuantity,
              ),
            }))
        : [];
      const available = availability.some(
        (entry) => entry.availableQuantity >= item.quantity,
      );
      const subtotal = pricing.currentPrice.mul(item.quantity);
      total = total.plus(subtotal);
      return {
        id: item.id,
        productId: item.productId,
        sizeId: item.sizeId,
        colorId: item.colorId,
        product: {
          id: item.product.id,
          name: item.product.name,
          imageUrl: item.product.imageUrl,
          active: item.product.active,
        },
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPrice: pricing.currentPrice.toNumber(),
        storedUnitPrice: item.unitPrice.toNumber(),
        priceChanged: !pricing.currentPrice.equals(item.unitPrice),
        promotionActive: pricing.promotionActive,
        subtotal: subtotal.toNumber(),
        available,
        availability,
        issue: !item.product.active
          ? 'PRODUCT_INACTIVE'
          : !valid
            ? 'VARIANT_UNAVAILABLE'
            : !available
              ? 'INSUFFICIENT_STOCK'
              : null,
      };
    });
    const availableBranches = items.length
      ? items[0].availability
          .filter((entry) =>
            items.every((item) =>
              item.availability.some(
                (candidate) =>
                  candidate.branch.id === entry.branch.id &&
                  candidate.availableQuantity >= item.quantity,
              ),
            ),
          )
          .map((entry) => entry.branch)
      : [];
    return {
      id: cart.id,
      status: cart.status,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      items,
      itemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      total: total.toNumber(),
      availableBranches,
      hasAvailability: availableBranches.length > 0,
    };
  }

  private validVariant(product: CartProduct, variant: CartVariant) {
    return (
      product.active &&
      product.sizes.some(({ sizeId }) => sizeId === variant.sizeId) &&
      product.colors.some(({ colorId }) => colorId === variant.colorId)
    );
  }

  private sameVariant(a: CartVariant, b: CartVariant) {
    return (
      a.productId === b.productId &&
      a.sizeId === b.sizeId &&
      a.colorId === b.colorId
    );
  }

  private requireItem(cart: CartRecord, itemId: number) {
    const item = cart.items.find((entry) => entry.id === itemId);
    if (!item)
      throw new NotFoundException('Item was not found in your active cart');
    return item;
  }
}
