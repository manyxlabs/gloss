import { defineConfig } from '@playwright/test';

// Web page import needs the Worker, so this suite runs the built app under `wrangler dev`, next to a
// local site to fetch. One Worker may fetch that site on localhost; a second keeps the default guard,
// which refuses private hosts.
const port = Number(process.env.PORT ?? 4340);
const worker = (at: number, allowPrivate: boolean) =>
  `npx wrangler dev --port ${at} --inspector-port ${at + 100} --persist-to test-results/wrangler-${at}${allowPrivate ? ' --var ALLOW_PRIVATE_HOSTS:1' : ''}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'web.wrangler.ts',
  outputDir: 'test-results/playwright-web',
  use: {
    baseURL: `http://localhost:${port}`,
    screenshot: 'only-on-failure',
    // As in playwright.config.ts: no service worker caching the whole app in every test.
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.CHROMIUM || undefined },
  },
  // Servers start in order, so the build finishes before either Worker serves it.
  webServer: [
    // Ready once it serves the app, not when its port opens: the first page from a fresh Worker can take longer than a test.
    { command: `npm run build && ${worker(port, true)}`, url: `http://localhost:${port}/`, reuseExistingServer: false, timeout: 120_000 },
    { command: worker(port + 2, false), url: `http://localhost:${port + 2}/`, reuseExistingServer: false },
    { command: `node e2e/article-server.ts ${port + 1}`, port: port + 1, reuseExistingServer: false },
  ],
});
