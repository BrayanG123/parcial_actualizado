import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InStoreSelectionDto } from '../../sales/dto/in-store-selection.dto.js';

/** Ticket de caja que se cobrara con tarjeta (Stripe, captura manual). */
export class PosCardIntentDto extends InStoreSelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  shiftId: number;

  /** Misma clave que se usara al registrar la venta. */
  @IsUUID('4')
  idempotencyKey: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  expectedTotal: number;
}

/** Registra la venta con el cobro ya autorizado por Stripe y lo captura. */
export class PosCardChargeDto extends PosCardIntentDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^pi_[A-Za-z0-9]+$/)
  paymentIntentId: string;
}
