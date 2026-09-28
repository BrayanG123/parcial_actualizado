import { IsIn } from 'class-validator';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum.js';

export class UpdateReservationStatusDto {
  @IsIn([
    ReservationStatus.PREPARING,
    ReservationStatus.READY,
    ReservationStatus.CUSTOMER_PRESENT,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ])
  status: ReservationStatus;
}
