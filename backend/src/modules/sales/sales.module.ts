import { OfflineSalesService } from './offline-sales.service.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PushModule } from '../push/push.module.js';
import { CheckoutExpirationService } from './checkout-expiration.service.js';
import { SalesController } from './sales.controller.js';
import { SalesRepository } from './sales.repository.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PushModule,
  ],
  controllers: [SalesController],
  providers: [
    SalesService,
    SalesRepository,
    CheckoutExpirationService,
    OfflineSalesService,
  ],
  exports: [SalesService, SalesRepository],
})
export class SalesModule {}
