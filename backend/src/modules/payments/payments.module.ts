import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { SalesModule } from '../sales/sales.module.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';
import { PaymentGatewayService } from './payment-gateway.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    SalesModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentGatewayService,
    PaymentsRepository,
    PaymentReconciliationService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
