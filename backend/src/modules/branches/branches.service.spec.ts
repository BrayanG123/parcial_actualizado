import { ConflictException, NotFoundException } from '@nestjs/common';
import { BranchesRepository } from './branches.repository.js';
import { BranchesService } from './branches.service.js';

describe('BranchesService', () => {
  const repository = {
    findByCityAndName: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    hasOpenReservations: vi.fn(),
    deactivate: vi.fn(),
  } as unknown as BranchesRepository;
  const service = new BranchesService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('rejects duplicate branch names in the same city', async () => {
    vi.mocked(repository.findByCityAndName).mockResolvedValue({ id: 1 });

    await expect(
      service.create({
        name: 'Central',
        city: 'La Paz',
        address: 'Av. Principal 100',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns not found for an unknown branch', async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('does not deactivate a branch with open reservations', async () => {
    vi.mocked(repository.findById).mockResolvedValue({ id: 1 } as never);
    vi.mocked(repository.hasOpenReservations).mockResolvedValue(true);

    await expect(service.deactivate(1)).rejects.toThrow(ConflictException);
    expect(repository.deactivate).not.toHaveBeenCalled();
  });
});
