import { defineConfig, devices } from '@playwright/test'

// End-to-end tests (e2e/). The app runs as a production build on its own
// port; the browser's API requests are answered by an in-test mock
// (e2e/support/mock-api.ts), so no API, database or model is involved.
// See docs/7-DEVELOPMENT/testing.md#end-to-end-tests-playwright.

const PORT = Number(process.env.E2E_PORT || 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`
// Optional: a Chromium already on the machine instead of Playwright's own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './e2e',
  // Not the default test-results/: a stray test-results/.last-run.json is
  // committed in frontend/, and a run would rewrite it.
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky test should fail, not pass on a second try.
  retries: 0,
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    ['html', { open: 'never', outputFolder: './playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Wide enough for the three-column notebook layout (Sources, Chat,
        // Studio) with room for toasts beside the chat.
        viewport: { width: 1440, height: 900 },
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    // A production build: no dev overlay, no on-demand compiles.
    command: `npx next build && npx next start --port ${PORT} --hostname 127.0.0.1`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 5 * 60_000,
    stdout: 'pipe',
    env: {
      // /config tells the browser to call the API on the app's own origin,
      // where the tests' mock answers (e2e/support/mock-api.ts).
      API_URL: BASE_URL,
      // Anything that still reached the Next.js /api proxy would fail here
      // instead of hitting a real API on the default port 5055.
      INTERNAL_API_URL: 'http://127.0.0.1:9',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
