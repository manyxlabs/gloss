import { defineConfig } from '@playwright/test';

// PORT lets several checkouts run their suites at once.
const port = Number(process.env.PORT ?? 4340);

export default defineConfig({
  testDir: 'e2e',
  // Sync needs the Worker, so its specs, sync.spec.ts and *.sync.spec.ts, have their own config: playwright.sync.config.ts.
  testIgnore: /sync\.spec\.ts$/,
  outputDir: 'test-results/playwright',
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
    screenshot: 'only-on-failure',
    // Each test's context is new, so the service worker would install and cache the whole app (about 11 MB)
    // in every test, slowing the page under test on a busy machine. Tests of working offline allow it.
    serviceWorkers: 'block',
    // Set CHROMIUM to a system browser where Playwright's own download is unavailable.
    launchOptions: { executablePath: process.env.CHROMIUM || undefined },
  },
  // BASE_URL runs the suite against a deployed site instead.
  webServer: process.env.BASE_URL ? undefined : { command: `npm run build && npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: false },
});
