import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  productPrice,
  ProductPricing,
} from '../../common/utils/product-price.js';
import { SaleItemDto } from './dto/sale-item.dto.js';

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function variantKey(
  item: Pick<SaleItemDto, 'productId' | 'sizeId' | 'colorId'>,
) {
  return `${item.productId}:${item.sizeId}:${item.colorId}`;
}

export function sortedItems<T extends SaleItemDto>(items: T[]): T[] {
  if (!items.length || items.length > 50)
    throw new BadRequestException('A sale requires 1–50 variants');
  if (new Set(items.map(variantKey)).size !== items.length)
    throw new BadRequestException('Duplicate variants are not allowed');
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100,
    )
  ) {
    throw new BadRequestException('Each quantity must be between 1 and 100');
  }
  return [...items].sort(
    (a, b) =>
      a.productId - b.productId || a.sizeId - b.sizeId || a.colorId - b.colorId,
  );
}

export function priceLine(
  item: SaleItemDto,
  product: ProductPricing & { name: string },
  sizeName: string,
  colorName: string,
  now: Date,
  wholesale = false,
) {
  const pricing = productPrice(product, now, wholesale);
  return {
    productId: item.productId,
    sizeId: item.sizeId,
    colorId: item.colorId,
    quantity: item.quantity,
    unitPrice: pricing.price,
    discount: pricing.price.minus(pricing.currentPrice),
    productName: product.name,
    sizeName,
    colorName,
  };
}

export type SaleLine = ReturnType<typeof priceLine>;

export function saleTotal(
  lines: Pick<SaleLine, 'quantity' | 'unitPrice' | 'discount'>[],
) {
  const total = lines.reduce(
    (sum, item) =>
      sum.plus(item.unitPrice.minus(item.discount).mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  if (total.lte(0) || total.gt('9999999999.99'))
    throw new ConflictException(
      'Sale total must be positive and fit the supported amount range',
    );
  return total;
}

export function presentLine<
  T extends {
    quantity: number;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
  },
>(item: T) {
  const netUnitPrice = item.unitPrice.minus(item.discount);
  return {
    ...item,
    unitPrice: item.unitPrice.toNumber(),
    discount: item.discount.toNumber(),
    netUnitPrice: netUnitPrice.toNumber(),
    subtotal: netUnitPrice.mul(item.quantity).toNumber(),
  };
}
