import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

const inventoryFixture = {
  id: 1,
  physicalQuantity: 10,
  reservedQuantity: 3,
  updatedAt: new Date(),
  branch: { id: 1, name: 'Central', city: 'La Paz', active: true },
  product: {
    id: 1,
    name: 'Camisa',
    imageUrl: null,
    active: true,
    category: { id: 1, name: 'Camisas' },
  },
  size: { id: 1, name: 'M' },
  color: { id: 1, name: 'Azul', hexCode: '#0000FF' },
};

describe('InventoryService', () => {
  const repository = {
    findAvailability: vi.fn(),
    findAll: vi.fn(),
    findEmployeeByUserId: vi.fn(),
  } as unknown as InventoryRepository;
  const service = new InventoryService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('only exposes available stock in the public response', async () => {
    vi.mocked(repository.findAvailability).mockResolvedValue({
      data: [inventoryFixture],
      total: 1,
    });

    const result = await service.findAvailability({ page: 1, limit: 20 });

    expect(result.data[0]).toMatchObject({ availableQuantity: 7 });
    expect(result.data[0]).not.toHaveProperty('physicalQuantity');
    expect(result.data[0]).not.toHaveProperty('reservedQuantity');
  });

  it('prevents a branch manager from reading another branch', async () => {
    vi.mocked(repository.findEmployeeByUserId).mockResolvedValue({
      id: 3,
      branchId: 1,
      active: true,
    });

    await expect(
      service.findAll(
        { page: 1, limit: 20, branchId: 2 },
        {
          id: 10,
          email: 'manager@example.com',
          roles: [Role.BRANCH_MANAGER],
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
