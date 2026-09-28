import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReservationItemDto } from './reservation-item.dto.js';

export class CreateReservationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId: number;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'approximateTime must include a time and timezone (Z or ±HH:MM)',
  })
  approximateTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemDto)
  items: ReservationItemDto[];
}
