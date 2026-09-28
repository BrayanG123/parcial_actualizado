import { productPrice } from '../../common/utils/product-price.js';
import type { CatalogRow } from './ai.repository.js';

export interface CatalogItem {
  id: number;
  name: string;
  description: string;
  categoryId: number;
  category: string;
  seasonId: number;
  season: string;
  seasonCurrent: boolean;
  collectionId: number;
  collection: string;
  price: number;
  currentPrice: number;
  discountPercent: number;
  promotionActive: boolean;
  sizes: Array<{ id: number; name: string }>;
  colors: Array<{ id: number; name: string }>;
  available: number;
  branches: string[];
}

export const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const STOPWORDS = new Set(
  'que para con los las una uno unos unas del por algo tengo tienes tienen hay quiero busco buscando necesito recomiendas recomendar recomienda puedes como cual cuales sus este esta estos estas muy mas pero hola gracias favor prenda prendas ropa tienda algun alguna'.split(
    ' ',
  ),
);

/** Palabras utiles, sin tildes ni plurales simples, para buscar en el catalogo. */
export function keywords(text: string): string[] {
  return [
    ...new Set(
      normalize(text)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !STOPWORDS.has(word))
        .map((word) => (word.length > 4 ? word.replace(/(es|s)$/, '') : word)),
    ),
  ];
}

const unique = <T extends { id: number }>(values: T[]) => [
  ...new Map(values.map((value) => [value.id, value])).values(),
];

/** Resume cada producto con precio vigente y solo las variantes con stock. */
export function catalogItems(rows: CatalogRow[], now = new Date()) {
  return rows.map((row): CatalogItem => {
    const stock = row.inventory
      .map((line) => ({
        ...line,
        available: line.physicalQuantity - line.reservedQuantity,
      }))
      .filter((line) => line.available > 0);
    const pricing = productPrice(row, now);
    return {
      id: row.id,
      name: row.name,
      description: (row.description ?? '').slice(0, 180),
      categoryId: row.categoryId,
      category: row.category.name,
      seasonId: row.seasonId,
      season: row.season.name,
      seasonCurrent:
        row.season.active &&
        row.season.startDate <= now &&
        row.season.endDate >= now,
      collectionId: row.collectionId,
      collection: row.collection.name,
      price: pricing.price.toNumber(),
      currentPrice: pricing.currentPrice.toNumber(),
      discountPercent: pricing.discountPercent.toNumber(),
      promotionActive: pricing.promotionActive,
      sizes: unique(stock.map((line) => line.size)),
      colors: unique(stock.map((line) => line.color)),
      available: stock.reduce((sum, line) => sum + line.available, 0),
      branches: [
        ...new Set(
          stock.map((line) => `${line.branch.name} (${line.branch.city})`),
        ),
      ],
    };
  });
}

export function rankByQuery(items: CatalogItem[], text: string) {
  const words = keywords(text);
  const wantsPromotion = /promo|oferta|descuento|rebaja/.test(normalize(text));
  return items
    .map((item) => {
      const name = normalize(item.name);
      const haystack = normalize(
        [
          item.name,
          item.category,
          item.season,
          item.collection,
          item.description,
          ...item.colors.map((color) => color.name),
          ...item.sizes.map((size) => `talla ${size.name}`),
        ].join(' '),
      );
      let score = words.reduce(
        (sum, word) =>
          sum + (name.includes(word) ? 3 : haystack.includes(word) ? 1 : 0),
        0,
      );
      if (wantsPromotion && item.promotionActive) score += 3;
      return { item, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.item.promotionActive) - Number(a.item.promotionActive) ||
        b.item.available - a.item.available,
    );
}

/** Forma compacta que se entrega al modelo: solo datos reales del catalogo. */
export function promptItem(item: CatalogItem) {
  return {
    id: item.id,
    nombre: item.name,
    categoria: item.category,
    temporada: item.season,
    coleccion: item.collection,
    descripcion: item.description || undefined,
    precioBs: item.currentPrice,
    ...(item.promotionActive
      ? { precioAnteriorBs: item.price, descuento: `${item.discountPercent}%` }
      : {}),
    tallasConStock: item.sizes.map((size) => size.name),
    coloresConStock: item.colors.map((color) => color.name),
    unidadesDisponibles: item.available,
    sucursales: item.branches,
  };
}
