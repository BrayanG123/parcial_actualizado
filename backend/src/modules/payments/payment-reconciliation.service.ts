import {
  Injectable,
  Optional,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service.js';
import { TenantsService } from '../tenancy/tenants.service.js';

@Injectable()
export class PaymentReconciliationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
    @Optional() private readonly tenants?: TenantsService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => this.tick(), 60000);
    this.timer.unref();
    this.tick();
  }
  private tick() {
    if (this.running) return;
    // Cada empresa se procesa con su propio contexto (aislamiento por tenant).
    const run = () => this.payments.reconcilePendingPayments();
    this.running = (this.tenants ? this.tenants.forEachTenant(run) : run())
      .then(() => undefined)
      .catch(() =>
        this.logger.error(
          'Payment reconciliation failed; retrying next minute',
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
