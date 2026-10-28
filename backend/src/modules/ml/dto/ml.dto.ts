import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class TrainMlDto {
  /** synthetic: historia simulada con la forma del catalogo; real: ventas de la empresa. */
  @IsIn(['synthetic', 'real'])
  source!: 'synthetic' | 'real';
}

export class MlDashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  horizon = 4;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  branchId?: number;
}
