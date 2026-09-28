import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  physicalQuantity: number;

  @IsString()
  @MaxLength(500)
  observation: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  reference?: string;
}
