import { defineConfig } from 'vitest/config';

// Unit tests: fast, no external services. Live next to the code as *.spec.ts.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
