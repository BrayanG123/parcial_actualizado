import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Evita el arranque de procesos forks que falla en este entorno Windows.
    pool: 'threads',
    maxWorkers: 1,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    env: { VITE_USE_MOCKS: 'false', VITE_API_URL: 'http://localhost:3000/api/v1' },
  },
});
