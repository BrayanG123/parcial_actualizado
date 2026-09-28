import type { CatalogItem } from './catalog-context.js';
import { buildProfile, scoreCandidates } from './recommendation-scoring.js';
import type { ClientHistory } from './ai.repository.js';

const item = (
  id: number,
  overrides: Partial<CatalogItem> = {},
): CatalogItem => ({
  id,
  name: `Prenda ${id}`,
  description: '',
  categoryId: 1,
  category: 'Camisas',
  seasonId: 1,
  season: 'Primavera',
  seasonCurrent: false,
  collectionId: 1,
  collection: 'Base',
  price: 100,
  currentPrice: 100,
  discountPercent: 0,
  promotionActive: false,
  sizes: [{ id: 1, name: 'S' }],
  colors: [{ id: 1, name: 'Blanco' }],
  available: 5,
  branches: ['Central (La Paz)'],
  ...overrides,
});

const line = (productId: number, categoryId: number, sizeId: number) => ({
  productId,
  size: { id: sizeId, name: sizeId === 2 ? 'M' : 'S' },
  color: { id: 9, name: 'Negro' },
  product: {
    name: `Comprada ${productId}`,
    categoryId,
    seasonId: 1,
    category: { name: categoryId === 2 ? 'Vestidos' : 'Camisas' },
  },
});

describe('recommendation scoring', () => {
  it('prioritizes preferred category and size with explainable reasons', () => {
    const history = {
      sales: [line(10, 2, 2)],
      reservations: [line(11, 2, 2)],
      cart: [],
    } as unknown as ClientHistory;
    const profile = buildProfile(history);
    expect(profile.categoryNames).toEqual(['Vestidos']);

    const ranked = scoreCandidates(
      [
        item(1),
        item(2, {
          categoryId: 2,
          category: 'Vestidos',
          sizes: [{ id: 2, name: 'M' }],
        }),
        item(10, {
          categoryId: 2,
          category: 'Vestidos',
          sizes: [{ id: 2, name: 'M' }],
        }),
        item(3, { available: 0, categoryId: 2 }),
      ],
      { profile, popularity: new Map() },
    );
    expect(ranked.map((r) => r.item.id)).toEqual([2, 10, 1]);
    expect(ranked[0].reasons).toEqual(
      expect.arrayContaining([
        'Sueles elegir vestidos',
        'Hay stock en tu talla M',
      ]),
    );
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked.every((r) => r.score >= 0 && r.score <= 1)).toBe(true);
  });

  it('suggests complements for a product page and never the same product', () => {
    const anchor = item(1, { collectionId: 7, collection: 'Oficina' });
    const ranked = scoreCandidates(
      [
        anchor,
        item(2, {
          categoryId: 3,
          category: 'Pantalones',
          collectionId: 7,
          collection: 'Oficina',
        }),
        item(3, { seasonCurrent: true }),
      ],
      { profile: buildProfile(null), popularity: new Map([[3, 1]]), anchor },
    );
    expect(ranked.map((r) => r.item.id)).toEqual([2, 3]);
    expect(ranked[0].reasons).toContain('De la misma coleccion Oficina');
  });
});
