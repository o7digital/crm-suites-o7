import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testMatch: 'product-fields.spec.ts',
  ...(process.env.PRODUCT_FIELDS_BASE_URL
    ? {
        use: { ...base.use, baseURL: process.env.PRODUCT_FIELDS_BASE_URL },
        webServer: undefined,
      }
    : {}),
});
