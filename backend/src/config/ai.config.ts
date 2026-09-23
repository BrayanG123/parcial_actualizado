import { registerAs } from '@nestjs/config';

export type AiProviderName = 'gemini' | 'ollama' | 'none';

const integer = (value: string | undefined, fallback: number) =>
  Number.parseInt(value ?? String(fallback), 10);

/** El proveedor se elige por entorno; las claves nunca salen del backend. */
export default registerAs('ai', () => ({
  provider: (process.env.AI_PROVIDER ?? 'gemini') as AiProviderName,
  timeoutMs: integer(process.env.AI_TIMEOUT_MS, 20000),
  requestsPerMinute: integer(process.env.AI_REQUESTS_PER_MINUTE, 20),
  // Generar una imagen tarda mucho mas que responder texto.
  imageTimeoutMs: integer(process.env.AI_IMAGE_TIMEOUT_MS, 90000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || undefined,
    // gemini-2.5-flash ya no se habilita para cuentas nuevas (responde 404).
    model: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
    // Probador con IA: modelo que edita imagenes (requiere cuota de pago en Google AI Studio).
    imageModel: process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image',
    baseUrl:
      process.env.GEMINI_BASE_URL ??
      'https://generativelanguage.googleapis.com/v1beta',
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'qwen2.5:3b',
  },
}));
