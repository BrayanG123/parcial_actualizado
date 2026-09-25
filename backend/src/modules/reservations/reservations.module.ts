import { PushModule } from '../push/push.module.js';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { ReservationExpirationService } from './reservation-expiration.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsRepository } from './reservations.repository.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [
    PushModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    ReservationsRepository,
    ReservationExpirationService,
  ],
  exports: [ReservationsService],
})
export class ReservationsModule {}
