import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';

const productFixture = {
  id: 1,
  name: 'Camisa Oxford',
  description: null,
  price: { toString: () => '100' },
  imageUrl: null,
  discountPercent: { toString: () => '20' },
  promotionStart: new Date('2020-01-01'),
  promotionEnd: new Date('2099-01-01'),
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  categoryId: 1,
  seasonId: 1,
  collectionId: 1,
  supplierId: 1,
  category: { id: 1, name: 'Camisas' },
  season: { id: 1, name: 'Verano' },
  collection: { id: 1, name: 'Esencial' },
  supplier: { id: 1, name: 'Proveedor' },
  sizes: [{ size: { id: 1, name: 'M' } }],
  colors: [{ color: { id: 1, name: 'Azul', hexCode: '#0000FF' } }],
  arResources: [],
};

describe('ProductsService', () => {
  const repository = {
    findById: vi.fn(),
    getDependencies: vi.fn(),
    findBySupplierAndName: vi.fn(),
    countInventoryOutsideVariants: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  } as unknown as ProductsRepository;
  const service = new ProductsService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('calculates the current promotional price', async () => {
    vi.mocked(repository.findById).mockResolvedValue(productFixture as never);

    const result = await service.findOne(1);

    expect(result.currentPrice).toBe(80);
    expect(result.promotionActive).toBe(true);
    expect(result.sizes).toEqual([{ id: 1, name: 'M' }]);
  });

  it('rejects a collection from a different season', async () => {
    vi.mocked(repository.getDependencies).mockResolvedValue([
      1,
      1,
      { active: true, seasonId: 99 },
      1,
      1,
      1,
    ]);

    await expect(
      service.create({
        name: 'Camisa',
        price: 100,
        discountPercent: 0,
        categoryId: 1,
        seasonId: 1,
        collectionId: 1,
        supplierId: 1,
        sizeIds: [1],
        colorIds: [1],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents removing variants that already have inventory history', async () => {
    vi.mocked(repository.findById).mockResolvedValue(productFixture as never);
    vi.mocked(repository.getDependencies).mockResolvedValue([
      1,
      1,
      { active: true, seasonId: 1 },
      1,
      1,
      1,
    ]);
    vi.mocked(repository.countInventoryOutsideVariants).mockResolvedValue(1);

    await expect(service.update(1, { sizeIds: [2] })).rejects.toThrow(
      ConflictException,
    );
  });

  describe('promotion date updates', () => {
    beforeEach(() => {
      vi.mocked(repository.findById).mockResolvedValue(productFixture as never);
      vi.mocked(repository.getDependencies).mockResolvedValue([
        1,
        1,
        { active: true, seasonId: 1 },
        1,
        1,
        1,
      ]);
      vi.mocked(repository.findBySupplierAndName).mockResolvedValue(null);
      vi.mocked(repository.update).mockImplementation(
        async (_id, data) =>
          ({
            ...productFixture,
            ...Object.fromEntries(
              Object.entries(data).filter(([, value]) => value !== undefined),
            ),
          }) as never,
      );
    });

    it('clears both dates and stops applying the discount', async () => {
      const dto = await new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }).transform(
        { promotionStart: null, promotionEnd: null },
        { type: 'body', metatype: UpdateProductDto },
      );
      const result = await service.update(1, dto);
      expect(repository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          promotionStart: null,
          promotionEnd: null,
        }),
        undefined,
        undefined,
      );
      expect(result.promotionStart).toBeNull();
      expect(result.promotionEnd).toBeNull();
      expect(result.promotionActive).toBe(false);
      expect(result.currentPrice).toBe(100);
    });

    it('preserves the dates when updating an unrelated field', async () => {
      const result = await service.update(1, { name: 'Camisa nueva' });
      expect(result.promotionStart).toEqual(productFixture.promotionStart);
      expect(result.promotionEnd).toEqual(productFixture.promotionEnd);
      expect(result.currentPrice).toBe(80);
    });

    it.each([
      { promotionStart: null },
      { promotionEnd: null },
      { promotionStart: '2100-01-01' },
    ])(
      'rejects an incomplete or inverted resulting period: %j',
      async (update) => {
        await expect(service.update(1, update)).rejects.toThrow(
          BadRequestException,
        );
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('allows changing one date while preserving the other', async () => {
      const result = await service.update(1, { promotionEnd: '2098-01-01' });
      expect(result.promotionStart).toEqual(productFixture.promotionStart);
      expect(result.promotionEnd).toEqual(new Date('2098-01-01'));
    });
  });
});
