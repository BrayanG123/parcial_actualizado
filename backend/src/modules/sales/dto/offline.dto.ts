import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from './sale-item.dto.js';
export class PrepareOfflineDto {
  @IsUUID('4') id: string;
  @IsUUID('4') deviceId: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) shiftId: number;
}
export class OfflineSaleDto {
  @IsUUID('4') deviceId: string;
  @IsUUID('4') idempotencyKey: string;
  @IsDateString({ strict: true }) recordedAt: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  expectedTotal: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
export class FinishOfflineDto {
  @IsUUID('4') deviceId: string;
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  keys: string[];
}
