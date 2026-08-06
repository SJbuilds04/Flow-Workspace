import { defineConfig } from '@playwright/test'

/**
 * E2E configuration for the Flow Workspace Electron shell.
 * Tests drive the compiled app in `out/`, so run `npm run build` first
 * (the `test:e2e` script does this for you).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
