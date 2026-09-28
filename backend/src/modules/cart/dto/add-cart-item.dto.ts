import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  sizeId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  colorId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}
