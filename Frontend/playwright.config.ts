import { defineConfig, devices } from '@playwright/test';

const PORT = 4320;
const ci = !!process.env['CI'];

/**
 * Accessibility tests (WCAG 2.2 AA). They run against the production build,
 * served by e2e/static-server.mjs, with every /api call mocked: no backend or database.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['list']] : [['list']],
  outputDir: './dist/.playwright/results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'fr-BE',
    timezoneId: 'Europe/Brussels',
    trace: 'retain-on-failure',
  },
  // Keyboard and language on a computer; reflow and text spacing at phone width; axe on both.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(axe|keyboard|language)\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(axe|layout)\.spec\.ts/ },
  ],
  webServer: {
    command: `node e2e/static-server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !ci,
  },
});
