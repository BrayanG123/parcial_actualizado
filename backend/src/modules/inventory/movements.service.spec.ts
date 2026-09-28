import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { InventoryRepository } from './inventory.repository.js';
import { MovementsService } from './movements.service.js';

const manager = {
  id: 10,
  email: 'manager@example.com',
  roles: [Role.BRANCH_MANAGER],
};

describe('MovementsService', () => {
  const repository = {
    validateVariant: vi.fn(),
    findEmployeeByUserId: vi.fn(),
    registerEntry: vi.fn(),
    findById: vi.fn(),
    adjustStock: vi.fn(),
  } as unknown as InventoryRepository;
  const service = new MovementsService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('requires a scheduled date for pending entries', async () => {
    await expect(
      service.registerEntry(
        {
          branchId: 1,
          productId: 1,
          sizeId: 1,
          colorId: 1,
          quantity: 5,
          status: 'PENDING' as never,
        },
        manager,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents a manager from moving stock in another branch', async () => {
    vi.mocked(repository.validateVariant).mockResolvedValue([1, 1]);
    vi.mocked(repository.findEmployeeByUserId).mockResolvedValue({
      id: 2,
      branchId: 2,
      active: true,
    });

    await expect(
      service.registerEntry(
        {
          branchId: 1,
          productId: 1,
          sizeId: 1,
          colorId: 1,
          quantity: 5,
          status: 'COMPLETED' as never,
        },
        manager,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not allow stock adjustments below the reserved quantity', async () => {
    vi.mocked(repository.findById).mockResolvedValue({
      id: 1,
      physicalQuantity: 10,
      reservedQuantity: 6,
      branch: { id: 1 },
    } as never);
    vi.mocked(repository.findEmployeeByUserId).mockResolvedValue({
      id: 2,
      branchId: 1,
      active: true,
    });

    await expect(
      service.adjust(
        1,
        { physicalQuantity: 5, observation: 'Conteo físico' },
        manager,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
