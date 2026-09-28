import { registerAs } from '@nestjs/config';

const parseCorsOrigins = (value?: string): string[] =>
  value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

export default registerAs('app', () => ({
  name: 'FashionStore API',
  environment: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  passwordSaltRounds: Number.parseInt(
    process.env.PASSWORD_SALT_ROUNDS ?? '12',
    10,
  ),
}));
