import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { SalesRepository } from './sales.repository.js';

describe('SalesRepository', () => {
  it.each(['P2002', 'P2034'])(
    'retries %s to resolve duplicate submissions or serialization conflicts',
    async (code) => {
      const transaction = vi
        .fn()
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('conflict', {
            code,
            clientVersion: '7.10.0',
          }),
        )
        .mockResolvedValueOnce(1);
      const repo = new SalesRepository({
        $transaction: transaction,
      } as unknown as PrismaService);
      expect(await repo.transaction(async () => 1)).toBe(1);
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('prevents a walk-in sale from consuming stock held by another customer', async () => {
    const repo = new SalesRepository({} as PrismaService);
    const tx = { inventory: { updateMany: vi.fn() } };
    await expect(
      repo.changeStock(
        { id: 1, physicalQuantity: 5, reservedQuantity: 4 },
        -2,
        0,
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow('Insufficient');
    expect(tx.inventory.updateMany).not.toHaveBeenCalled();
  });

  it('bounds retry attempts and does not repeat stock/business errors', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '7.10.0',
        }),
      );
    const repo = new SalesRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(repo.transaction(async () => 1)).rejects.toThrow(
      'Concurrent sale',
    );
    expect(transaction).toHaveBeenCalledTimes(4);
    transaction.mockReset().mockRejectedValue(new Error('Insufficient stock'));
    await expect(repo.transaction(async () => 1)).rejects.toThrow(
      'Insufficient',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
