import { ConfigService } from '@nestjs/config';
import { ReservationExpirationService } from './reservation-expiration.service.js';
import { ReservationsService } from './reservations.service.js';

describe('ReservationExpirationService', () => {
  afterEach(() => vi.useRealTimers());

  it('runs at startup, avoids overlapping scans and stops on shutdown', async () => {
    vi.useFakeTimers();
    let finish!: (count: number) => void;
    const expireDueReservations = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(0);
    const worker = new ReservationExpirationService(
      { expireDueReservations } as unknown as ReservationsService,
      new ConfigService({ NODE_ENV: 'development' }),
    );
    worker.onApplicationBootstrap();
    expect(expireDueReservations).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120000);
    expect(expireDueReservations).toHaveBeenCalledTimes(1);
    finish(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(expireDueReservations).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60000);
    expect(expireDueReservations).toHaveBeenCalledTimes(2);
  });

  it('does not start background work in tests', async () => {
    const expireDueReservations = vi.fn();
    const worker = new ReservationExpirationService(
      { expireDueReservations } as unknown as ReservationsService,
      new ConfigService({ NODE_ENV: 'test' }),
    );
    worker.onApplicationBootstrap();
    expect(expireDueReservations).not.toHaveBeenCalled();
    await worker.onModuleDestroy();
  });
});
