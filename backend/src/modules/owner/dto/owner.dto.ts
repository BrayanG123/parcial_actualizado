import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Otra empresa de un dueño: el administrador es el propio dueño (su cuenta y contraseña). */
export class OwnerCreateTenantDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @Transform(lower)
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, {
    message: 'slug must use lowercase letters, numbers and hyphens',
  })
  slug: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  planCode: string;
}
