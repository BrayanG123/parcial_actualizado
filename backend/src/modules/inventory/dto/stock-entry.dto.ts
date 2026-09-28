import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { InventoryMovementStatus } from '../../../common/enums/inventory-movement.enum.js';

export class StockEntryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  branchId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  sizeId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  colorId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsEnum(InventoryMovementStatus)
  status: InventoryMovementStatus = InventoryMovementStatus.COMPLETED;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}
