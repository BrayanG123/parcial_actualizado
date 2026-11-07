import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Las suites comparten un PostgreSQL y servicios con limites en memoria: en paralelo
    // compiten (timeouts intermitentes en IA). En serie el resultado es reproducible.
    fileParallelism: false,
  },
});
