import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { Role } from '../../common/enums/role.enum.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const jwtService = {
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
  } as unknown as JwtService;
  const usersService = {
    createCustomer: vi.fn(),
    findByEmailForAuthentication: vi.fn(),
    findOne: vi.fn(),
  } as unknown as UsersService;
  const service = new AuthService(usersService, jwtService);

  beforeEach(() => vi.clearAllMocks());

  it('registers a customer and creates a session', async () => {
    vi.mocked(usersService.createCustomer).mockResolvedValue({
      id: 1,
      name: 'Ana Cliente',
      email: 'ana@example.com',
      active: true,
      registeredAt: new Date(),
      updatedAt: new Date(),
      client: null,
      employee: null,
      roles: [{ role: { id: 4, name: 'CUSTOMER', description: null } }],
    });

    const result = await service.register({
      name: 'Ana Cliente',
      email: 'ana@example.com',
      password: 'Password123',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      email: 'ana@example.com',
      roles: [Role.CUSTOMER],
    });
  });

  it('logs in an active user with a valid password', async () => {
    const passwordHash = await hash('Password123', 4);
    vi.mocked(usersService.findByEmailForAuthentication).mockResolvedValue({
      id: 1,
      name: 'Ana Cliente',
      email: 'ana@example.com',
      passwordHash,
      active: true,
      registeredAt: new Date(),
      updatedAt: new Date(),
      client: null,
      employee: null,
      roles: [{ role: { id: 4, name: 'CUSTOMER', description: null } }],
    });

    const result = await service.login({
      email: 'ana@example.com',
      password: 'Password123',
    });

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokenType).toBe('Bearer');
  });

  it('does not reveal whether the email or password was incorrect', async () => {
    vi.mocked(usersService.findByEmailForAuthentication).mockResolvedValue(
      null,
    );

    await expect(
      service.login({ email: 'missing@example.com', password: 'Password123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
