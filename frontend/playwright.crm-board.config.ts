import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: process.env.CRM_BOARD_URL || base.use?.baseURL },
  webServer: process.env.CRM_BOARD_URL ? undefined : base.webServer,
  testMatch: 'crm-board.spec.ts',
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
  ],
});
