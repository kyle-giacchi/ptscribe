import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8090',
    trace: 'on-first-retry',
  },
  // A dedicated port + forced demo mode, so a running dev server or a local
  // `.env.development.local` (VITE_DEMO_MODE=false) can't leak into the run.
  // Process env outranks every .env file in Vite.
  webServer: {
    command: 'npm run dev -- --port 8090 --strictPort',
    url: 'http://localhost:8090',
    env: { VITE_DEMO_MODE: 'true' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
