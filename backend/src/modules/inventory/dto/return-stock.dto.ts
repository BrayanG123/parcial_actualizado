import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReturnStockDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @IsString()
  @MaxLength(500)
  observation: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  reference?: string;
}
