import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Sync runs against the real Worker, with its Durable Object emulated by wrangler.
const port = Number(process.env.PORT ?? 4351);

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /sync\.spec\.ts$/,
  use: { ...base.use, baseURL: process.env.BASE_URL ?? `http://localhost:${port}` },
  webServer: process.env.BASE_URL ? undefined : { command: `npm run build && npx wrangler dev --port ${port}`, port, reuseExistingServer: false, timeout: 180_000 },
});
