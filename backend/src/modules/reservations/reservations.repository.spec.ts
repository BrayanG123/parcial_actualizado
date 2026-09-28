import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { ReservationsRepository } from './reservations.repository.js';

describe('reservation transaction retry', () => {
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError('Write conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    });

  it('retries serialization conflicts but returns a bounded conflict under persistent contention', async () => {
    const transaction = vi.fn().mockRejectedValue(conflict());
    const repository = new ReservationsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(repository.transaction(async () => 1)).rejects.toThrow(
      ConflictException,
    );
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it('succeeds after a serialization retry', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(42);
    const repository = new ReservationsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    expect(await repository.transaction(async () => 42)).toBe(42);
  });

  it('does not retry business validation errors', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValue(new ConflictException('Insufficient stock'));
    const repository = new ReservationsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(repository.transaction(async () => 1)).rejects.toThrow(
      'Insufficient stock',
    );
    expect(transaction).toHaveBeenCalledOnce();
  });
});
