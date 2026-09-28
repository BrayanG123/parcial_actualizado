import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SalesModule } from '../sales/sales.module.js';
import { CashController } from './cash.controller.js';
import { CashService } from './cash.service.js';
@Module({
  imports: [SalesModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [CashController],
  providers: [CashService],
})
export class CashModule {}
