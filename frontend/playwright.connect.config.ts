import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "connect.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3109",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {},
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3109",
    url: "http://127.0.0.1:3109",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
