import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { SalesModule } from '../sales/sales.module.js';
import { ExchangesModule } from '../exchanges/exchanges.module.js';
import { SyncSalesService } from './sync-sales.service.js';
import { SyncSnapshotService } from './sync-snapshot.service.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    SalesModule,
    ReservationsModule,
    ExchangesModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncSalesService, SyncSnapshotService],
})
export class SyncModule {}
