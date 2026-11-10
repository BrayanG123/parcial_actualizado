import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Plan al que la empresa quiere cambiar. */
export class ChangeOwnPlanDto {
  @Transform(upper)
  @IsString()
  @MaxLength(40)
  planCode: string;
}

/** Meses a renovar del plan actual. */
export class RenewOwnPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months = 1;
}

export class ListSubscriptionPaymentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @IsIn(['PAID', 'FAILED', 'REFUNDED', 'PENDING'])
  status?: string;
}
