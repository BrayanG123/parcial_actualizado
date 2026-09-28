import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SalesService } from './sales.service.js';

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
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => this.tick(), 60000);
    this.timer.unref();
    this.tick();
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.sales
      .expirePendingCheckouts()
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
