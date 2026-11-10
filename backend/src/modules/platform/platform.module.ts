import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BillingController } from './billing.controller.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';
import {
  PlatformAuthController,
  PlatformController,
} from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { SaasController, SignupRateLimitGuard } from './saas.controller.js';

@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [
    PlatformAuthController,
    PlatformController,
    SaasController,
    BillingController,
  ],
  providers: [PlatformService, SignupRateLimitGuard, SubscriptionBillingService],
  exports: [PlatformService, SubscriptionBillingService],
})
export class PlatformModule {}
