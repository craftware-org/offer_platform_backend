import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests of the main flows (Phase 9). They expect a running website (E2E_WEB_URL, default
 * http://localhost:3001) talking to a running API + worker on a disposable database, with the
 * console SMS/email providers so login codes can be read from the API log (E2E_API_LOG). CI starts
 * all of that (see the "Browser tests" job in .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Runs after desktop: it searches for the offer the desktop run created.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: '**/visitor.e2e.ts', dependencies: ['desktop'] },
  ],
});
