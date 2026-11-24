// The interface checks: the describe flow end to end, axe on every route in both themes, and screenshots of
// the flow's key steps at 360 and 1280. They run against the production build, served as Vercel serves it
// (e2e/serve.mjs), in Chromium. Build first: `bun run --filter @weave/api build && bun run --filter @weave/app build`.
import { defineConfig, devices } from "@playwright/test";

// Its own port, apart from the app-production launch server (4790), so a test never meets a server started
// before the last build: the preview server keeps the record page it read when it started.
const port = Number(process.env.WEAVE_E2E_PORT ?? 4796);

export default defineConfig({
  testDir: "e2e",
  // One worker: every test uses the same server, and screenshots must not race the machine.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  // In CI a missing or changed picture fails and is never written: the workflow takes new ones on purpose.
  updateSnapshots: process.env.CI ? "none" : "missing",
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide", scale: "css" },
  },
  // Screenshots are compared only against pictures taken where CI takes them, so the path has no platform.
  // WEAVE_SCREENSHOT_DIR points a local trial run somewhere else, so its pictures are never mistaken for CI's.
  snapshotPathTemplate: `${process.env.WEAVE_SCREENSHOT_DIR ?? "{testDir}/screenshots"}/{arg}-{projectName}{ext}`,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    // The app keeps motion short; with reduced motion nothing moves between a step and its picture.
    reducedMotion: "reduce",
    // Full Chromium in its new headless mode, as people's Chrome is. Playwright's lighter headless shell
    // crashes on the describe step (seen 23 November 2026 with 1.65.1), which no person's browser does.
    channel: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    { name: "phone", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 360, height: 780 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true } },
    { name: "wide", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `node e2e/serve.mjs ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
