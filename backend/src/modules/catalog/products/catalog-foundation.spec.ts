import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { RegisterDto } from '../../auth/dto/register.dto.js';
import { productPrice } from '../../../common/utils/product-price.js';
import { priceLine, saleTotal } from '../../sales/sale-pricing.js';

describe('Catalog foundation', () => {
  const product = {
    price: '100',
    wholesalePrice: '65',
    discountPercent: '20',
    promotionStart: new Date('2020-01-01'),
    promotionEnd: new Date('2099-01-01'),
  };
  it('applies wholesale without stacking a retail promotion and falls back when no wholesale price exists', () => {
    expect(productPrice(product).currentPrice.toNumber()).toBe(80);
    expect(
      productPrice(product, new Date(), true).currentPrice.toNumber(),
    ).toBe(65);
    expect(productPrice(product, new Date(), true).promotionActive).toBe(false);
    expect(
      productPrice(
        { ...product, wholesalePrice: null },
        new Date(),
        true,
      ).currentPrice.toNumber(),
    ).toBe(80);
    const line = priceLine(
      { productId: 1, sizeId: 1, colorId: 1, quantity: 3 },
      { ...product, name: 'Camisa' },
      'M',
      'Azul',
      new Date(),
      true,
    );
    expect(saleTotal([line]).toNumber()).toBe(195);
    expect(line.discount.toNumber()).toBe(0);
  });

  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it('validates image arrays, permits clearing a gallery and rejects self-enrollment as wholesale', async () => {
    const meta = { type: 'body' as const, metatype: UpdateProductDto };
    await expect(
      pipe.transform({ imageUrls: [] }, meta),
    ).resolves.toMatchObject({ imageUrls: [] });
    for (const imageUrls of [
      null,
      'https://example.test/a.png',
      ['javascript:alert(1)'],
      ['https://example.test/a.png', 'https://example.test/a.png'],
      Array.from({ length: 9 }, (_, i) => `https://example.test/${i}.png`),
    ])
      await expect(pipe.transform({ imageUrls }, meta)).rejects.toThrow(
        BadRequestException,
      );
    await expect(
      pipe.transform(
        {
          name: 'Ana',
          email: 'ana@example.com',
          password: 'Password123',
          wholesale: true,
        },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
  const current = {
    ...product,
    id: 1,
    categoryId: 1,
    seasonId: 1,
    collectionId: 1,
    supplierId: 1,
    name: 'Camisa',
    sizes: [{ size: { id: 1 } }],
    colors: [{ color: { id: 1 } }],
  };
  const repository = {
    findById: vi.fn(),
    getDependencies: vi.fn(),
    findBySupplierAndName: vi.fn(),
    update: vi.fn(),
  };
  const service = new ProductsService(
    repository as unknown as ProductsRepository,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    repository.findById.mockResolvedValue(current);
    repository.getDependencies.mockResolvedValue([
      1,
      1,
      { active: true, seasonId: 1 },
      1,
      1,
      1,
    ]);
    repository.update.mockImplementation(async (_id, data) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
    }));
  });
  it('keeps the primary image synchronized when replacing, reordering or clearing a gallery', async () => {
    for (const urls of [
      ['https://example.test/b.png', 'https://example.test/a.png'],
      [],
    ]) {
      await service.update(1, { imageUrls: urls });
      expect(repository.update).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ imageUrls: urls, imageUrl: urls[0] ?? null }),
        undefined,
        undefined,
      );
    }
  });
  it('rejects reducing retail below the stored wholesale price and allows clearing wholesale explicitly', async () => {
    await expect(service.update(1, { price: 50 })).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
    await service.update(1, { price: 50, wholesalePrice: null });
    expect(repository.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ price: 50, wholesalePrice: null }),
      undefined,
      undefined,
    );
  });
});
