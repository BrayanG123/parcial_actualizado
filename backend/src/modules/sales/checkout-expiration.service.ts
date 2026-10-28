import {
  Injectable,
  Optional,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SalesService } from './sales.service.js';
import { TenantsService } from '../tenancy/tenants.service.js';

@Injectable()
export class CheckoutExpirationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CheckoutExpirationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    private readonly sales: SalesService,
    private readonly config: ConfigService,
    @Optional() private readonly tenants?: TenantsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => this.tick(), 60000);
    this.timer.unref();
    this.tick();
  }

  private tick(): void {
    if (this.running) return;
    // Cada empresa se procesa con su propio contexto (aislamiento por tenant).
    const run = () => this.sales.expirePendingCheckouts();
    this.running = (this.tenants ? this.tenants.forEachTenant(run) : run())
      .then(() => undefined)
      .catch((error: unknown) =>
        this.logger.error(
          'Checkout expiration failed; retrying next minute',
          error instanceof Error ? error.stack : undefined,
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
