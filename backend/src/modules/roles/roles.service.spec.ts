import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { RolesRepository } from './roles.repository.js';
import { RolesService } from './roles.service.js';

describe('RolesService', () => {
  const repository = {
    findUserContext: vi.fn(),
    findByName: vi.fn(),
    branchExists: vi.fn(),
    hasAssignment: vi.fn(),
    assign: vi.fn(),
    remove: vi.fn(),
  } as unknown as RolesRepository;
  const service = new RolesService(repository);

  beforeEach(() => vi.clearAllMocks());

  it('requires a branch when assigning an employee role', async () => {
    vi.mocked(repository.findUserContext).mockResolvedValue({
      id: 1,
      client: null,
      employee: null,
      _count: { roles: 1 },
    });
    vi.mocked(repository.findByName).mockResolvedValue({
      id: 3,
      name: 'CASHIER',
      description: null,
    });

    await expect(service.assign(1, Role.CASHIER, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('prevents removing the last role from a user', async () => {
    vi.mocked(repository.findUserContext).mockResolvedValue({
      id: 1,
      client: null,
      employee: null,
      _count: { roles: 1 },
    });
    vi.mocked(repository.findByName).mockResolvedValue({
      id: 4,
      name: 'CUSTOMER',
      description: null,
    });
    vi.mocked(repository.hasAssignment).mockResolvedValue(true);

    await expect(service.remove(1, Role.CUSTOMER)).rejects.toThrow(
      ConflictException,
    );
  });
});
