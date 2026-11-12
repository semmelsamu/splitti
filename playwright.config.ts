import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4317);
const baseURL = `http://127.0.0.1:${port}`;

// Browser tests for the core flows. They run against the production build
// (npm run test:e2e builds first) with a fresh data folder under .tmp/.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // The server recognises one receipt at a time; more workers only queue up there.
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 120_000,
  use: {
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // The wireframes are drawn for a 390 × 844 phone.
      name: 'handy',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
