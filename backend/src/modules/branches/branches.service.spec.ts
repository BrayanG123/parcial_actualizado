import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionAccessService } from '../tenancy/subscription-access.service.js';
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
  const access = {
    assertCanActivateBranch: vi.fn(),
  } as unknown as SubscriptionAccessService;
  const service = new BranchesService(repository, access);

  beforeEach(() => vi.clearAllMocks());

  it('applies the plan limit before creating a branch', async () => {
    vi.mocked(access.assertCanActivateBranch).mockRejectedValueOnce(
      new ForbiddenException({ code: 'PLAN_LIMIT_REACHED' }),
    );
    await expect(
      service.create({ name: 'Norte', city: 'La Paz', address: 'Av. 1 #100' }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('applies the plan limit only when an inactive branch is reactivated', async () => {
    const update = vi.fn().mockResolvedValue({ id: 1 });
    Object.assign(repository, { update });
    vi.mocked(repository.findByCityAndName).mockResolvedValue(null);
    vi.mocked(repository.findById).mockResolvedValue({
      id: 1,
      city: 'La Paz',
      name: 'Norte',
      active: true,
    } as never);
    await service.update(1, { active: true });
    expect(access.assertCanActivateBranch).not.toHaveBeenCalled();
    vi.mocked(repository.findById).mockResolvedValue({
      id: 1,
      city: 'La Paz',
      name: 'Norte',
      active: false,
    } as never);
    await service.update(1, { active: true });
    expect(access.assertCanActivateBranch).toHaveBeenCalledTimes(1);
  });

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
