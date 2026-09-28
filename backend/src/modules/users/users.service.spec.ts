import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../common/enums/role.enum.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const repository = {
    findByEmailForAuthentication: vi.fn(),
    findRolesByNames: vi.fn(),
    branchExists: vi.fn(),
    create: vi.fn(),
  } as unknown as UsersRepository;
  const configService = {
    get: vi.fn().mockReturnValue(4),
  } as unknown as ConfigService;
  const service = new UsersService(repository, configService);

  beforeEach(() => vi.clearAllMocks());

  it('creates the customer profile together with its role', async () => {
    vi.mocked(repository.findByEmailForAuthentication).mockResolvedValue(null);
    vi.mocked(repository.findRolesByNames).mockResolvedValue([
      { id: 4, name: 'CUSTOMER' },
    ]);
    vi.mocked(repository.create).mockResolvedValue({ id: 1 } as never);

    await service.createCustomer({
      name: 'Ana Cliente',
      email: 'ANA@EXAMPLE.COM',
      password: 'Password123',
      phone: '70000000',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana@example.com',
        roleIds: [4],
        client: { phone: '70000000', address: undefined, wholesale: false },
      }),
    );
  });

  it('rejects duplicate emails', async () => {
    vi.mocked(repository.findByEmailForAuthentication).mockResolvedValue({
      id: 1,
    } as never);

    await expect(
      service.createCustomer({
        name: 'Ana Cliente',
        email: 'ana@example.com',
        password: 'Password123',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('requires a branch for cashiers', async () => {
    vi.mocked(repository.findByEmailForAuthentication).mockResolvedValue(null);
    vi.mocked(repository.findRolesByNames).mockResolvedValue([
      { id: 3, name: 'CASHIER' },
    ]);

    await expect(
      service.create({
        name: 'Carlos Caja',
        email: 'carlos@example.com',
        password: 'Password123',
        roles: [Role.CASHIER],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
