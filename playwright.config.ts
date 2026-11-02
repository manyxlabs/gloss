import { defineConfig } from '@playwright/test';

// PORT lets several checkouts run their suites at once.
const port = Number(process.env.PORT ?? 4340);

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/playwright',
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
    screenshot: 'only-on-failure',
    // Set CHROMIUM to a system browser where Playwright's own download is unavailable.
    launchOptions: { executablePath: process.env.CHROMIUM || undefined },
  },
  // BASE_URL runs the suite against a deployed site instead.
  webServer: process.env.BASE_URL ? undefined : { command: `npm run build && npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: false },
});
