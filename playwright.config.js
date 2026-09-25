// @ts-check
// Cross-browser front-end tests. Run with `npm test`.
// The app has no build step, so we just serve the repo root statically.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 5173;
// Set BASE_URL to test a deployed site instead, e.g.
//   BASE_URL=https://chordtrainer.io npm test
const BASE_URL = process.env.BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL || `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Desktop
    { name: 'chromium',      use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',       use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',        use: { ...devices['Desktop Safari'] } },
    // Mobile (emulated viewport, touch and user agent)
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: BASE_URL ? undefined : {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
