import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ReservationItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  colorId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}
