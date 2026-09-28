import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InStoreSelectionDto } from './in-store-selection.dto.js';

export class CreateInStoreSaleDto extends InStoreSelectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  shiftId: number;

  @IsUUID('4')
  idempotencyKey: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  expectedTotal: number;

  @IsIn(['CASH', 'CARD', 'QR', 'BANK_TRANSFER'])
  paymentMethod: 'CASH' | 'CARD' | 'QR' | 'BANK_TRANSFER';

  @IsOptional()
  @IsString()
  @MaxLength(175)
  paymentReference?: string;
}
