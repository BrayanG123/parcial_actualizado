import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SupplierPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
export class SupplierProductDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 160)
  name: string;
  @IsString()
  @MaxLength(5000)
  description: string;
  @IsString()
  @MaxLength(500)
  supplierAvailability: string;
  // Send both together when changing the assignment; archived metadata may be left untouched.
  @ValidateIf((o) => o.seasonId !== undefined || o.collectionId !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  seasonId?: number;
  @ValidateIf((o) => o.seasonId !== undefined || o.collectionId !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  collectionId?: number;
}
