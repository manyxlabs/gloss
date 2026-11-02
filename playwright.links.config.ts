import { defineConfig } from '@playwright/test';

// Adding files from share links needs the Worker, so this suite runs the built app under `wrangler dev`.
// The spec serves the cloud storage providers' addresses itself, on the next port, and this Worker
// fetches them there instead (TEST_PROVIDER_ORIGIN). A second Worker keeps the default guard.
const port = Number(process.env.PORT ?? 4398);
const worker = (at: number, test: boolean) =>
  `npx wrangler dev --port ${at} --inspector-port ${at + 100} --persist-to test-results/wrangler-${at}${test ? ` --var ALLOW_PRIVATE_HOSTS:1 --var TEST_PROVIDER_ORIGIN:http://localhost:${port + 1}` : ''}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'links.wrangler.ts',
  outputDir: 'test-results/playwright-links',
  // One server stands in for the providers, so the tests share it.
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM || undefined },
  },
  // Servers start in order, so the build finishes before either Worker serves it.
  webServer: [
    { command: `npm run build && ${worker(port, true)}`, port, reuseExistingServer: false, timeout: 120_000 },
    { command: worker(port + 2, false), port: port + 2, reuseExistingServer: false },
  ],
});
