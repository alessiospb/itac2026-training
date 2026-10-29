import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Each test owns its browser context (see tests/fixtures.ts), so tests can run in parallel.
  fullyParallel: true,
  // Pinned to 2: with the local default (6 workers on a 12-core Windows host) the first wave of
  // Chromium launches stalled the host (a 4.7 KB local page took 7.7 s to receive) and
  // /api/products never answered within the timeout. 2 workers passed 8/8 full runs. It also
  // matches Playwright's default on a 4-vCPU GitHub runner. See docs/competition-changes.md (C-09).
  workers: 2,
  forbidOnly: !!process.env.CI,
  // Zero retries: the competition requires green runs without retries, and retries hide flakiness.
  retries: 0,
  timeout: 15000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node app/server.cjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
