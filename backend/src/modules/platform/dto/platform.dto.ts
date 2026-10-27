import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class TenantAdminDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Transform(lower)
  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter and one number',
  })
  password: string;
}

export class CreateTenantDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  /** Codigo publico: minusculas, numeros y guiones (se usa en /t/:slug y X-Tenant). */
  @Transform(lower)
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, {
    message: 'slug must use lowercase letters, numbers and hyphens',
  })
  slug: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  planCode: string;

  /** Duracion de la suscripcion simulada (meses). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;

  @ValidateNested()
  @Type(() => TenantAdminDto)
  admin: TenantAdminDto;
}

export class UpdateTenantDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class ChangePlanDto {
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  planCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class RenewSubscriptionDto {
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class SubscriptionNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class UpdatePlanDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxActiveBranches?: number;

  /** Banderas de funcionalidad, p. ej. { "aiReports": true }. */
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreatePlanDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/)
  code: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  maxActiveBranches: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPrice?: number;
}
