import { defineConfig } from '@playwright/test';

// End-to-end tests against the local stack: `supabase start`, `pnpm functions:serve`, then
// `pnpm e2e`. They create and delete their own throwaway users.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    // Uses the installed Chrome locally; CI installs Playwright's Chromium instead.
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
