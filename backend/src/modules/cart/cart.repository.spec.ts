import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { CartRepository } from './cart.repository.js';

describe('CartRepository transaction', () => {
  it.each(['P2034', 'P2002'])(
    'retries %s and returns the successful result',
    async (code) => {
      const transaction = vi
        .fn()
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Concurrent cart', {
            code,
            clientVersion: '7.10.0',
          }),
        )
        .mockResolvedValueOnce(42);
      const repository = new CartRepository({
        $transaction: transaction,
      } as unknown as PrismaService);
      expect(await repository.transaction(async () => 42)).toBe(42);
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('bounds retries under persistent conflicts', async () => {
    const transaction = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Concurrent cart', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );
    const repository = new CartRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(repository.transaction(async () => 42)).rejects.toThrow(
      ConflictException,
    );
    expect(transaction).toHaveBeenCalledTimes(4);
  });
});
