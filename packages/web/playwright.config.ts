import { defineConfig, devices } from '@playwright/test';

const PORT = 48113;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'latte', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
    { name: 'mocha', use: { ...devices['Pixel 7'], colorScheme: 'dark' } }
  ],
  webServer: {
    command: 'node mock/server.ts',
    env: { MOCK_PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/auth`,
    reuseExistingServer: !process.env.CI
  }
});
