import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SalesModule } from '../sales/sales.module.js';
import { ExchangesController } from './exchanges.controller.js';
import { ExchangesService } from './exchanges.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), SalesModule],
  controllers: [ExchangesController],
  providers: [ExchangesService],
  exports: [ExchangesService],
})
export class ExchangesModule {}
