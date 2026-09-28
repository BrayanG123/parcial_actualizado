import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Datos que el propio usuario puede cambiar. Correo, contrasena, roles y
 * clasificacion mayorista siguen siendo responsabilidad del administrador.
 */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** Vacio borra el telefono. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^$|^[+\d][\d ()-]{5,29}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  /** Vacio borra la direccion. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(250)
  address?: string;
}
