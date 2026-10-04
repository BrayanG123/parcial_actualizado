import type { PrismaService } from '../../../database/prisma/prisma.service.js';
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { ProductsRepository } from './products.repository.js';

describe('ProductsRepository.findAll stock filters', () => {
  const reservedField = { name: 'reservedQuantity' };
  const prisma = {
    product: { findMany: vi.fn(), count: vi.fn() },
    inventory: { fields: { reservedQuantity: reservedField } },
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
  };
  const repository = new ProductsRepository(prisma as unknown as PrismaService);

  function query(values: Partial<ListProductsQueryDto>) {
    return { page: 1, limit: 20, ...values } as ListProductsQueryDto;
  }
  function whereOf() {
    return prisma.product.findMany.mock.calls.at(-1)![0].where;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
  });

  it('does not filter by stock unless requested', async () => {
    await repository.findAll(query({}));
    expect(whereOf()).not.toHaveProperty('inventory');
  });

  it('inStock keeps products with available units in an active branch', async () => {
    await repository.findAll(query({ inStock: true, sizeId: 2, colorId: 3 }));
    expect(whereOf().inventory).toEqual({
      some: {
        branchId: undefined,
        sizeId: 2,
        colorId: 3,
        physicalQuantity: { gt: reservedField },
        branch: { active: true },
      },
    });
    expect(prisma.product.count).toHaveBeenCalledWith({ where: whereOf() });
  });

  it('branchId alone means available in that branch', async () => {
    await repository.findAll(query({ branchId: 7 }));
    expect(whereOf().inventory.some).toMatchObject({
      branchId: 7,
      physicalQuantity: { gt: reservedField },
    });
  });
});
