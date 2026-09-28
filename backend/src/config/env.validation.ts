import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().trim().default('api/v1'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  DATABASE_POOL_MAX: Joi.number().integer().min(1).default(10),
  DATABASE_IDLE_TIMEOUT_MS: Joi.number().integer().min(0).default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(1).default(5000),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  CHECKOUT_HOLD_MINUTES: Joi.number().integer().min(1).max(120).default(15),
  STRIPE_SECRET_KEY: Joi.string()
    .empty('')
    .pattern(/^sk_test_[A-Za-z0-9]+$/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string()
    .empty('')
    .pattern(/^whsec_[A-Za-z0-9]+$/)
    .optional(),
  STRIPE_PUBLISHABLE_KEY: Joi.string()
    .empty('')
    .pattern(/^pk_test_[A-Za-z0-9]+$/)
    .optional(),
  CLOUDINARY_CLOUD_NAME: Joi.string()
    .empty('')
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  CLOUDINARY_API_KEY: Joi.string().empty('').optional(),
  CLOUDINARY_API_SECRET: Joi.string().empty('').optional(),
  SALES_CURRENCY: Joi.string()
    .pattern(/^[A-Z]{3}$/)
    .default('BOB'),
  PASSWORD_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
  RESERVATION_TIME_ZONE: Joi.string()
    .custom((value: string, helpers) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .default('America/La_Paz'),
  AI_PROVIDER: Joi.string().valid('gemini', 'ollama', 'none').default('gemini'),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(20000),
  AI_REQUESTS_PER_MINUTE: Joi.number().integer().min(1).max(1000).default(20),
  AI_IMAGE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(5000)
    .max(300000)
    .default(90000),
  GEMINI_API_KEY: Joi.string().empty('').optional(),
  GEMINI_IMAGE_MODEL: Joi.string()
    .pattern(/^[a-zA-Z0-9._-]+$/)
    .default('gemini-3.1-flash-image'),
  GEMINI_MODEL: Joi.string()
    .pattern(/^[a-zA-Z0-9._-]+$/)
    .default('gemini-3.6-flash'),
  OLLAMA_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:11434'),
  OLLAMA_MODEL: Joi.string()
    .pattern(/^[a-zA-Z0-9._:/-]+$/)
    .default('qwen2.5:3b'),
  // Notificaciones push (Firebase Cloud Messaging): las tres juntas o ninguna.
  FIREBASE_PROJECT_ID: Joi.string().empty('').optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().email().empty('').optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().empty('').optional(),
  SEED_ADMIN_EMAIL: Joi.string().email().optional(),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).max(72).optional(),
})
  .and('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY')
  .and('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET')
  .and('FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY')
  .unknown(true);

export const validateEnvironment = (
  config: Record<string, unknown>,
): Record<string, unknown> => {
  const { error, value } = environmentValidationSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (error) {
    // Joi pattern errors may contain the supplied secret. Report names and codes only.
    throw new Error(
      `Environment validation failed: ${error.details.map((detail) => `${detail.path.join('.') || 'configuration'} (${detail.type})`).join(', ')}`,
    );
  }

  return value as Record<string, unknown>;
};
