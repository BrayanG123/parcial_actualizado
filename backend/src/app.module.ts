import { CashModule } from './modules/cash/cash.module.js';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import aiConfig from './config/ai.config.js';
import mlConfig from './config/ml.config.js';
import appConfig from './config/app.config.js';
import databaseConfig from './config/database.config.js';
import { validateEnvironment } from './config/env.validation.js';
import { PrismaModule } from './database/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BranchesModule } from './modules/branches/branches.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { SalesModule } from './modules/sales/sales.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { VirtualFittingModule } from './modules/virtual-fitting/virtual-fitting.module.js';
import { PushModule } from './modules/push/push.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { ExchangesModule } from './modules/exchanges/exchanges.module.js';
import { MlModule } from './modules/ml/ml.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { TenantMiddleware } from './modules/tenancy/tenant.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig, aiConfig, mlConfig],
      validate: validateEnvironment,
    }),
    PrismaModule,
    TenancyModule,
    AuthModule,
    UsersModule,
    RolesModule,
    BranchesModule,
    CatalogModule,
    InventoryModule,
    ReservationsModule,
    CartModule,
    SalesModule,
    CashModule,
    PaymentsModule,
    ReportsModule,
    NotificationsModule,
    AiModule,
    VirtualFittingModule,
    PushModule,
    PlatformModule,
    SyncModule,
    ExchangesModule,
    MlModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*path');
  }
}
