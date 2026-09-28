import { Transform, Type } from 'class-transformer';
import { IsBase64, IsIn, IsInt, MaxLength, Min } from 'class-validator';

export const TRY_ON_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** ~6 MB de imagen: el movil envia una foto reducida (1024 px), bastante menos. */
export const TRY_ON_MAX_BASE64 = 8_000_000;

export class TryOnDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;

  /** Foto de la persona en base64, con o sin prefijo data:image/...;base64, */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/^data:image\/[a-z]+;base64,/i, '').replace(/\s/g, '')
      : value,
  )
  @MaxLength(TRY_ON_MAX_BASE64)
  @IsBase64()
  image!: string;

  @IsIn(TRY_ON_MIME_TYPES)
  mimeType!: string;
}
