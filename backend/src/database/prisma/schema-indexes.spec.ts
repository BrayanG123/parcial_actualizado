import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rendimiento multiempresa (F10.3 / RNF09): toda consulta filtra por empresa, asi que cada
 * tabla con `tenantId` necesita un indice cuya primera columna sea `tenantId`.
 */
const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(
  ([, name, body]) => ({ name, body }),
);

describe('indices por empresa', () => {
  it('cada modelo con tenantId tiene un indice que empieza por tenantId', () => {
    const tenantModels = models.filter((m) => /^\s+tenantId\s/m.test(m.body));
    expect(tenantModels.length).toBeGreaterThanOrEqual(29);
    const missing = tenantModels.filter(({ body }) => {
      const leading = [
        ...body.matchAll(/@@(?:index|unique|id)\(\[([^\]]*)\]/g),
      ].map((m) => m[1].split(',')[0].trim());
      const fieldUnique = /^\s+tenantId\s[^\n]*@(unique|id)\b/m.test(body);
      return !leading.includes('tenantId') && !fieldUnique;
    });
    expect(missing.map((m) => m.name)).toEqual([]);
  });

  it('las claves unicas de negocio incluyen la empresa', () => {
    // Un unique global (p. ej. nombre de categoria) impediria que dos empresas usen el mismo valor.
    const globalUniques = models.flatMap(({ name, body }) =>
      /^\s+tenantId\s/m.test(body)
        ? [...body.matchAll(/@@unique\(\[([^\]]*)\]/g)]
            .map((m) => m[1])
            .filter((cols) => !cols.includes('tenantId'))
            .map((cols) => `${name}(${cols})`)
        : [],
    );
    // Revisadas: la primera columna es un padre que pertenece a una sola empresa.
    expect(globalUniques).toEqual(REVIEWED_GLOBAL_UNIQUES);
  });
});

const REVIEWED_GLOBAL_UNIQUES = [
  'Collection(seasonId, name)',
  'Product(supplierId, name)',
  'Inventory(branchId, productId, sizeId, colorId)',
  'ReservationItem(reservationId, productId, sizeId, colorId)',
  'CartItem(cartId, productId, sizeId, colorId)',
  'CashRegister(branchId, name)',
  'CashShift(userId, openingKey)',
  'Sale(createdById, idempotencyKey)',
];
