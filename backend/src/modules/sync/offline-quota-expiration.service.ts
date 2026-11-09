import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantsService } from '../tenancy/tenants.service.js';
import { OfflineQuotaService } from './offline-quota.service.js';

/** Cada 10 minutos devuelve al stock libre los cupos offline vencidos de cada empresa. */
@Injectable()
export class OfflineQuotaExpirationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OfflineQuotaExpirationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly quotas: OfflineQuotaService,
    private readonly config: ConfigService,
    @Optional() private readonly tenants?: TenantsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => this.tick(), 600_000);
    this.timer.unref();
    this.tick();
  }

  private tick(): void {
    if (this.running) return;
    const run = () => this.quotas.releaseExpired();
    this.running = (this.tenants ? this.tenants.forEachTenant(run) : run())
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(
          'Offline quota expiration failed; will retry',
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
