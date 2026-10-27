import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Cambio de prenda: una linea de la venta original por otra variante (misma o distinta prenda). */
export class CreateExchangeDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) saleId: number;
  /** Linea de la venta; offline puede omitirse y se busca por la variante devuelta. */
  @ValidateIf((o: CreateExchangeDto) => o.returnedProductId === undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  saleItemId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) returnedProductId?: number;
  @ValidateIf((o: CreateExchangeDto) => o.returnedProductId !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  returnedSizeId?: number;
  @ValidateIf((o: CreateExchangeDto) => o.returnedProductId !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  returnedColorId?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) quantity: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) newProductId: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) newSizeId: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) newColorId: number;

  /** Sucursal donde se hace el cambio (el personal solo puede usar la suya). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) branchId?: number;

  /** Turno donde se cobra en efectivo la diferencia a favor de la tienda. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shiftId?: number;

  @IsOptional() @IsString() @MaxLength(250) reason?: string;

  /** Diferencia calculada en el dispositivo; si no coincide se informa PRICE_CHANGED. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  expectedDifference?: number;
}

export class RedeemCreditNoteDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class UpdateTenantSettingsDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(365) exchangeWindowDays: number;
}
