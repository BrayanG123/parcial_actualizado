import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  IsString,
  Length,
  ValidateIf,
  IsNumber,
} from 'class-validator';

export class CheckoutPreviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cartId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  branchId: number;
}

export class CheckoutDto extends CheckoutPreviewDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsIn(['STRIPE', 'CASH_ON_DELIVERY'])
  paymentOption?: 'STRIPE' | 'CASH_ON_DELIVERY';

  @ValidateIf(
    (o) =>
      o.paymentOption === 'CASH_ON_DELIVERY' || o.deliveryName !== undefined,
  )
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  deliveryName?: string;

  @ValidateIf(
    (o) =>
      o.paymentOption === 'CASH_ON_DELIVERY' || o.deliveryPhone !== undefined,
  )
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[+\d][\d ()-]{5,29}$/)
  deliveryPhone?: string;

  @ValidateIf(
    (o) =>
      o.paymentOption === 'CASH_ON_DELIVERY' || o.deliveryAddress !== undefined,
  )
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 250)
  deliveryAddress?: string;
  @IsUUID('4')
  idempotencyKey: string;

  @IsIn(['WEB', 'MOBILE'])
  channel: 'WEB' | 'MOBILE';

  @Matches(/^[a-f0-9]{64}$/)
  quoteHash: string;
}

export class DeliverSaleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  shiftId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  expectedTotal: number;
}
