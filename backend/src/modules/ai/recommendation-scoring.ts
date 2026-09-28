import type { ClientHistory } from './ai.repository.js';
import { keywords, normalize, type CatalogItem } from './catalog-context.js';

export interface ClientProfile {
  interactions: number;
  categories: Map<number, number>;
  sizes: Map<number, number>;
  colors: Map<number, number>;
  purchased: Set<number>;
  categoryNames: string[];
  sizeNames: string[];
  colorNames: string[];
  recentProducts: string[];
}

export interface ScoredCandidate {
  item: CatalogItem;
  score: number;
  reasons: string[];
}

const add = (map: Map<number, number>, id: number, weight: number) =>
  map.set(id, (map.get(id) ?? 0) + weight);

const topNames = (entries: Map<string, number>) =>
  [...entries]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

/** Compras pesan mas que reservas, y estas mas que el carrito actual. */
export function buildProfile(history: ClientHistory | null): ClientProfile {
  const profile: ClientProfile = {
    interactions: 0,
    categories: new Map(),
    sizes: new Map(),
    colors: new Map(),
    purchased: new Set(),
    categoryNames: [],
    sizeNames: [],
    colorNames: [],
    recentProducts: [],
  };
  if (!history) return profile;
  const names = {
    categories: new Map<string, number>(),
    sizes: new Map<string, number>(),
    colors: new Map<string, number>(),
  };
  const sources = [
    [history.sales, 3],
    [history.reservations, 2],
    [history.cart, 1],
  ] as const;
  for (const [lines, weight] of sources) {
    for (const line of lines) {
      profile.interactions += 1;
      add(profile.categories, line.product.categoryId, weight);
      add(profile.sizes, line.size.id, weight);
      add(profile.colors, line.color.id, weight);
      const category = line.product.category.name;
      names.categories.set(
        category,
        (names.categories.get(category) ?? 0) + weight,
      );
      names.sizes.set(
        line.size.name,
        (names.sizes.get(line.size.name) ?? 0) + weight,
      );
      names.colors.set(
        line.color.name,
        (names.colors.get(line.color.name) ?? 0) + weight,
      );
    }
  }
  for (const line of history.sales) profile.purchased.add(line.productId);
  profile.categoryNames = topNames(names.categories);
  profile.sizeNames = topNames(names.sizes);
  profile.colorNames = topNames(names.colors);
  profile.recentProducts = [
    ...new Set(
      [...history.sales, ...history.reservations].map(
        (line) => line.product.name,
      ),
    ),
  ].slice(0, 5);
  return profile;
}

const share = (map: Map<number, number>, id: number) => {
  const max = Math.max(0, ...map.values());
  return max ? (map.get(id) ?? 0) / max : 0;
};

/**
 * Puntaje explicable (0-1) con preferencias, historial, temporada, categoria,
 * talla y disponibilidad. Solo recibe productos con stock.
 */
export function scoreCandidates(
  items: CatalogItem[],
  options: {
    profile: ClientProfile;
    popularity: Map<number, number>;
    anchor?: CatalogItem;
    context?: string;
  },
): ScoredCandidate[] {
  const { profile, popularity, anchor } = options;
  const words = options.context ? keywords(options.context) : [];
  const maxSold = Math.max(0, ...popularity.values());
  return items
    .filter((item) => item.available > 0 && item.id !== anchor?.id)
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      if (profile.interactions) {
        const category = share(profile.categories, item.categoryId);
        if (category > 0) {
          score += 0.3 * category;
          reasons.push(`Sueles elegir ${item.category.toLowerCase()}`);
        }
        const size = item.sizes.find((s) => profile.sizes.has(s.id));
        if (size) {
          score += 0.2;
          reasons.push(`Hay stock en tu talla ${size.name}`);
        }
        const color = item.colors.find((c) => profile.colors.has(c.id));
        if (color) {
          score += 0.1;
          reasons.push(
            `Disponible en ${color.name.toLowerCase()}, un color que ya elegiste`,
          );
        }
        if (profile.purchased.has(item.id)) score -= 0.25;
      }
      if (anchor) {
        if (item.collectionId === anchor.collectionId) {
          score += 0.25;
          reasons.push(`De la misma coleccion ${item.collection}`);
        } else if (item.seasonId === anchor.seasonId) score += 0.1;
        if (item.categoryId !== anchor.categoryId) {
          score += 0.15;
          reasons.push(`Complementa ${anchor.name}`);
        }
      }
      if (words.length) {
        const haystack = normalize(
          `${item.name} ${item.category} ${item.season} ${item.collection} ${item.description}`,
        );
        if (words.some((word) => haystack.includes(word))) {
          score += 0.3;
          reasons.push(`Coincide con "${options.context}"`);
        }
      }
      if (item.seasonCurrent) {
        score += 0.15;
        reasons.push(`De la temporada en curso: ${item.season}`);
      }
      if (item.promotionActive) {
        score += 0.1;
        reasons.push(`${item.discountPercent}% de descuento vigente`);
      }
      const sold = maxSold ? (popularity.get(item.id) ?? 0) / maxSold : 0;
      score += 0.1 * sold;
      if (sold >= 0.5) reasons.push('Entre las prendas mas vendidas');
      if (!reasons.length) reasons.push('Disponible en nuestras sucursales');
      return {
        item,
        reasons,
        score:
          Math.round(Math.max(0, Math.min(1, score / 1.3)) * 10000) / 10000,
      };
    })
    .sort((a, b) => b.score - a.score || b.item.available - a.item.available);
}
