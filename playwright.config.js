import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  use: { baseURL: 'http://localhost:3001', launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  } },
  webServer: { command: 'node tests/browser-fixture.mjs', url: 'http://localhost:3001/sales-stock', reuseExistingServer: false, timeout: 30000 },
  reporter: [['list']],
});
