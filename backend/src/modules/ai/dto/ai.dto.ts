import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(1200)
  text!: string;
}

export class AssistantDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

export class RecommendationsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit = 6;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  context?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId?: number;
}

export class AiReportQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;
}
