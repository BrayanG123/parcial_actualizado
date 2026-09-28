import { BadRequestException, ConflictException } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogService', () => {
  const repository = {
    findSeasonByName: vi.fn(),
    createSeason: vi.fn(),
    findCategory: vi.fn(),
    findCategoryByName: vi.fn(),
    deleteCategory: vi.fn(),
  } as unknown as CatalogRepository;
  const service = new CatalogService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('rejects seasons whose end date precedes the start date', async () => {
    await expect(
      service.createSeason({
        name: 'Temporada inválida',
        startDate: '2027-01-01',
        endDate: '2026-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents deleting a category used by products', async () => {
    vi.mocked(repository.findCategory).mockResolvedValue({
      id: 1,
      name: 'Camisas',
      description: null,
      _count: { products: 2 },
    });

    await expect(service.deleteCategory(1)).rejects.toThrow(ConflictException);
    expect(repository.deleteCategory).not.toHaveBeenCalled();
  });
});
