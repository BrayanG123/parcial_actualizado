import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { SaleChannel, SaleStatus } from '../../../generated/prisma/client.js';

export class ListSalesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  branchId?: number;

  @IsOptional()
  @IsIn(Object.values(SaleStatus))
  status?: SaleStatus;

  @IsOptional()
  @IsIn(Object.values(SaleChannel))
  channel?: SaleChannel;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
