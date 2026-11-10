import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  // El registro exige 8+ caracteres; el login acepta 6+ para cuentas de demostracion.
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
