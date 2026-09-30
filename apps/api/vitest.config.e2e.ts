import { defineConfig } from 'vitest/config';

// Integration/e2e tests: run against real Postgres/PostGIS + Redis started by Testcontainers.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
