import { defineConfig } from '@playwright/test';

// End-to-end tests run against the built dist/, served from a subpath (/dist/) on this project's static port.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5416/dist/', actionTimeout: 10000 },
  expect: { timeout: 8000 },
  webServer: {
    command: 'node scripts/serve.mjs 5416',
    url: 'http://127.0.0.1:5416/dist/',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
