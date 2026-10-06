import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'reporting-charts.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:3108',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3108',
    url: 'http://127.0.0.1:3108',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
