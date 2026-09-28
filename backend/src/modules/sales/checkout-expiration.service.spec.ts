import { ConfigService } from '@nestjs/config';
import { SalesService } from './sales.service.js';
import { CheckoutExpirationService } from './checkout-expiration.service.js';

describe('CheckoutExpirationService', () => {
  afterEach(() => vi.useRealTimers());

  it('runs at startup, avoids overlap and stops on shutdown', async () => {
    vi.useFakeTimers();
    let finish!: (value: number) => void;
    const expirePendingCheckouts = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(0);
    const worker = new CheckoutExpirationService(
      { expirePendingCheckouts } as unknown as SalesService,
      new ConfigService({ NODE_ENV: 'development' }),
    );
    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60000);
    expect(expirePendingCheckouts).toHaveBeenCalledTimes(1);
    finish(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(expirePendingCheckouts).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60000);
    expect(expirePendingCheckouts).toHaveBeenCalledTimes(2);
  });

  it('does not run background scans in the test environment', async () => {
    const expirePendingCheckouts = vi.fn();
    const worker = new CheckoutExpirationService(
      { expirePendingCheckouts } as unknown as SalesService,
      new ConfigService({ NODE_ENV: 'test' }),
    );
    worker.onApplicationBootstrap();
    expect(expirePendingCheckouts).not.toHaveBeenCalled();
    await worker.onModuleDestroy();
  });
});
