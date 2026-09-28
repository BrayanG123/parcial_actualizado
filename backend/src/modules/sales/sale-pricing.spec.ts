import {
  priceLine,
  saleTotal,
  sortedItems,
  fingerprint,
} from './sale-pricing.js';

describe('Sale pricing', () => {
  const item = { productId: 1, sizeId: 1, colorId: 1, quantity: 3 };
  const product = {
    name: 'Camisa',
    price: '19.99',
    discountPercent: '15',
    promotionStart: new Date('2020-01-01'),
    promotionEnd: new Date('2099-01-01'),
  };

  it('persists base price and per-unit discount, with exact totals', () => {
    const line = priceLine(item, product, 'M', 'Azul', new Date());
    expect(line.unitPrice.toFixed(2)).toBe('19.99');
    expect(line.discount.toFixed(2)).toBe('3.00');
    expect(saleTotal([line]).toFixed(2)).toBe('50.97');
    expect(line.productName).toBe('Camisa');
  });

  it('rejects duplicate variants and invalid quantities', () => {
    expect(() => sortedItems([item, item])).toThrow('Duplicate');
    expect(() => sortedItems([{ ...item, quantity: 0 }])).toThrow('quantity');
    expect(() => sortedItems([])).toThrow('1–50');
  });

  it('rejects totals outside the supported payment range', () => {
    const free = priceLine(
      item,
      { ...product, price: '0' },
      'M',
      'Azul',
      new Date(),
    );
    expect(() => saleTotal([free])).toThrow('positive');
    const overflow = priceLine(
      { ...item, quantity: 100 },
      { ...product, price: '9999999999.99', discountPercent: '0' },
      'M',
      'Azul',
      new Date(),
    );
    expect(() => saleTotal([overflow])).toThrow('range');
  });

  it('fingerprints quotes deterministically and detects content changes', () => {
    expect(fingerprint(item)).toBe(fingerprint({ ...item }));
    expect(fingerprint(item)).not.toBe(fingerprint({ ...item, quantity: 2 }));
  });
});
