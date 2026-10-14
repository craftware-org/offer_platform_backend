import { defineConfig } from 'vitest/config';

// Unit tests cover the pure helpers in src/lib (no React Native runtime needed).
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
