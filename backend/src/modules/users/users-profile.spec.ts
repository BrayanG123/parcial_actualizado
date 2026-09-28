import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

describe('UsersService.updateOwnProfile', () => {
  const repository = { findById: vi.fn(), update: vi.fn() };
  const service = new UsersService(
    repository as unknown as UsersRepository,
    { get: () => 10 } as unknown as ConfigService,
  );

  beforeEach(() => vi.resetAllMocks());

  it('updates the name and customer contact data, clearing empty values', async () => {
    repository.findById.mockResolvedValue({ id: 5, client: { id: 2 } });
    await service.updateOwnProfile(5, {
      name: 'Ana',
      phone: '',
      address: 'Av. Siempre Viva 123',
    });
    expect(repository.update).toHaveBeenCalledWith(
      5,
      { name: 'Ana' },
      { phone: null, address: 'Av. Siempre Viva 123' },
    );
  });

  it('does not touch the customer profile when only the name changes', async () => {
    repository.findById.mockResolvedValue({ id: 9, client: null });
    await service.updateOwnProfile(9, { name: 'Admin' });
    expect(repository.update).toHaveBeenCalledWith(
      9,
      { name: 'Admin' },
      undefined,
    );
  });

  it('rejects contact data for accounts without a customer profile', async () => {
    repository.findById.mockResolvedValue({ id: 9, client: null });
    await expect(
      service.updateOwnProfile(9, { phone: '70000000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
