import {
  Injectable,
  Optional,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReservationsService } from './reservations.service.js';
import { TenantsService } from '../tenancy/tenants.service.js';

@Injectable()
export class ReservationExpirationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReservationExpirationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly reservations: ReservationsService,
    private readonly config: ConfigService,
    @Optional() private readonly tenants?: TenantsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => this.tick(), 60_000);
    this.timer.unref();
    this.tick();
  }

  private tick(): void {
    if (this.running) return;
    // Cada empresa se procesa con su propio contexto (aislamiento por tenant).
    const run = () => this.reservations.expireDueReservations();
    this.running = (this.tenants ? this.tenants.forEachTenant(run) : run())
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(
          'Reservation expiration failed; will retry in one minute',
          error instanceof Error ? error.stack : undefined,
        );
      })
      .finally(() => {
        this.running = undefined;
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
