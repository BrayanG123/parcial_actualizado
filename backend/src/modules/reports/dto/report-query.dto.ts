import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class BranchReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  branchId?: number;
}
export class PeriodReportQueryDto extends BranchReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
export class CashShiftsReportQueryDto extends PeriodReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  registerId?: number;
}
export class SalesReportQueryDto extends PeriodReportQueryDto {
  @IsOptional()
  @IsIn(['IN_STORE', 'WEB', 'MOBILE'])
  channel?: 'IN_STORE' | 'WEB' | 'MOBILE';
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
export class TopProductsQueryDto extends SalesReportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
export class InventoryReportQueryDto extends BranchReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  categoryId?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId?: number;
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  lowStockThreshold = 5;
  @IsIn(['true', 'false'])
  lowStockOnly = 'false';
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
