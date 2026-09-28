import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service.js';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';

describe('PaymentReconciliationService', () => {
  afterEach(() => vi.useRealTimers());
  it('recovers at startup, prevents overlap and stops on shutdown', async () => {
    vi.useFakeTimers();
    let finish!: (value: number) => void;
    const reconcilePendingPayments = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(0);
    const worker = new PaymentReconciliationService(
      { reconcilePendingPayments } as unknown as PaymentsService,
      new ConfigService({ NODE_ENV: 'development' }),
    );
    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60000);
    expect(reconcilePendingPayments).toHaveBeenCalledTimes(1);
    finish(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(reconcilePendingPayments).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60000);
    expect(reconcilePendingPayments).toHaveBeenCalledTimes(2);
  });
  it('does not contact Stripe automatically during tests', async () => {
    const reconcilePendingPayments = vi.fn();
    const worker = new PaymentReconciliationService(
      { reconcilePendingPayments } as unknown as PaymentsService,
      new ConfigService({ NODE_ENV: 'test' }),
    );
    worker.onApplicationBootstrap();
    expect(reconcilePendingPayments).not.toHaveBeenCalled();
    await worker.onModuleDestroy();
  });
});
