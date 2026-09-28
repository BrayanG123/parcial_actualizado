import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUrl, MaxLength } from 'class-validator';

/** Formatos que abren model-viewer, Scene Viewer (Android) y AR Quick Look (iOS). */
export const AR_FORMATS = ['GLB', 'GLTF', 'USDZ'] as const;
export const AR_TYPES = ['MODEL_3D'] as const;

export class CreateArResourceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['https', 'http'],
  })
  @MaxLength(2000)
  url!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(AR_FORMATS)
  format!: (typeof AR_FORMATS)[number];

  @IsOptional()
  @IsIn(AR_TYPES)
  type: (typeof AR_TYPES)[number] = 'MODEL_3D';
}
