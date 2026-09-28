import { productPrice } from './product-price.js';

describe('productPrice', () => {
  const now = new Date('2030-06-15T12:00:00Z');
  const product = {
    price: '19.99',
    discountPercent: '15',
    promotionStart: new Date('2030-06-01'),
    promotionEnd: new Date('2030-06-30'),
  };

  it('applies the same promotional price for catalog and cart', () => {
    expect(productPrice(product, now).currentPrice.toFixed(2)).toBe('16.99');
  });

  it('uses decimal half-up rounding for half-cent discounts', () => {
    expect(
      productPrice(
        { ...product, price: '0.05', discountPercent: '50' },
        now,
      ).currentPrice.toFixed(2),
    ).toBe('0.03');
  });

  it('ignores expired, future and incomplete promotions', () => {
    for (const dates of [
      { promotionEnd: new Date('2020-01-01') },
      { promotionStart: new Date('2040-01-01') },
      { promotionEnd: null },
    ]) {
      expect(
        productPrice({ ...product, ...dates }, now).currentPrice.toFixed(2),
      ).toBe('19.99');
      expect(productPrice({ ...product, ...dates }, now).promotionActive).toBe(
        false,
      );
    }
  });
});
