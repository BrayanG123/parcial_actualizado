import { Prisma } from '../../generated/prisma/client.js';

export interface ProductPricing {
  wholesalePrice?: { toString(): string } | null;
  price: { toString(): string };
  discountPercent: { toString(): string };
  promotionStart: Date | null;
  promotionEnd: Date | null;
}

// Shared by catalog and cart; stored prices and totals use decimal arithmetic.
export function productPrice(
  product: ProductPricing,
  now = new Date(),
  wholesale = false,
) {
  if (wholesale && product.wholesalePrice != null) {
    const price = new Prisma.Decimal(product.wholesalePrice.toString());
    return {
      price,
      currentPrice: price,
      discountPercent: new Prisma.Decimal(0),
      promotionActive: false,
    };
  }
  const price = new Prisma.Decimal(product.price.toString());
  const discountPercent = new Prisma.Decimal(
    product.discountPercent.toString(),
  );
  const promotionActive = Boolean(
    discountPercent.gt(0) &&
    product.promotionStart &&
    product.promotionEnd &&
    product.promotionStart <= now &&
    product.promotionEnd >= now,
  );
  const currentPrice = (
    promotionActive
      ? price.mul(new Prisma.Decimal(1).minus(discountPercent.div(100)))
      : price
  ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { price, discountPercent, promotionActive, currentPrice };
}
