import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "signatures.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3128",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { channel: "chrome" },
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3128",
    url: "http://127.0.0.1:3128",
    timeout: 120000,
  },
});
