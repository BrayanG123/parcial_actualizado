import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RemovePushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;
}

export class RegisterPushTokenDto extends RemovePushTokenDto {
  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  platform?: 'WEB' | 'ANDROID' | 'IOS';
}
