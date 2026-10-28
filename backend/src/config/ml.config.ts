import { registerAs } from '@nestjs/config';

/** Servicio de ML interno (FastAPI). El token nunca llega a los clientes. */
export default registerAs('ml', () => ({
  url: process.env.ML_SERVICE_URL || undefined,
  token: process.env.ML_SERVICE_TOKEN || undefined,
  timeoutMs: Number.parseInt(process.env.ML_TIMEOUT_MS ?? '60000', 10),
}));
