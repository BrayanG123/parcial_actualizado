import { validateEnvironment } from './env.validation.js';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/tienda_ropa',
    JWT_SECRET: 'a-secure-test-secret-with-32-characters',
  };

  it('applies safe defaults to a valid environment', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.API_PREFIX).toBe('api/v1');
    expect(result.DATABASE_POOL_MAX).toBe(10);
    expect(result.RESERVATION_TIME_ZONE).toBe('America/La_Paz');
    expect(result.CHECKOUT_HOLD_MINUTES).toBe(15);
    expect(result.SALES_CURRENCY).toBe('BOB');
  });

  it('rejects missing required values', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Environment validation failed',
    );
  });

  it('accepts a complete test Stripe configuration', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        STRIPE_SECRET_KEY: 'sk_test_local',
        STRIPE_WEBHOOK_SECRET: 'whsec_local',
        STRIPE_PUBLISHABLE_KEY: 'pk_test_local',
      }).STRIPE_SECRET_KEY,
    ).toBe('sk_test_local');
  });

  it('rejects partial/live credentials without leaking secret values', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        STRIPE_SECRET_KEY: 'sk_test_local',
      }),
    ).toThrow('Environment validation failed');
    try {
      validateEnvironment({
        ...validEnvironment,
        STRIPE_SECRET_KEY: 'sk_live_veryprivate',
        STRIPE_WEBHOOK_SECRET: 'whsec_local',
        STRIPE_PUBLISHABLE_KEY: 'pk_live_veryprivate',
      });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(String(error)).toContain('Environment validation failed');
      expect(String(error)).not.toContain('veryprivate');
    }
  });

  it('rejects invalid checkout windows and currency codes', () => {
    for (const config of [
      { CHECKOUT_HOLD_MINUTES: 0 },
      { CHECKOUT_HOLD_MINUTES: 121 },
      { SALES_CURRENCY: 'bolivianos' },
    ]) {
      expect(() =>
        validateEnvironment({ ...validEnvironment, ...config }),
      ).toThrow('Environment validation failed');
    }
  });

  it('rejects invalid reservation time zones', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        RESERVATION_TIME_ZONE: 'invalid/timezone',
      }),
    ).toThrow('Environment validation failed');
  });

  it('rejects unsupported database protocols', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://localhost/fashion_store',
      }),
    ).toThrow('Environment validation failed');
  });
});
