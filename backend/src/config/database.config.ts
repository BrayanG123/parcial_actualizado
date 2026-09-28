import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  poolMax: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
  idleTimeoutMs: Number.parseInt(
    process.env.DATABASE_IDLE_TIMEOUT_MS ?? '30000',
    10,
  ),
  connectionTimeoutMs: Number.parseInt(
    process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '5000',
    10,
  ),
}));
