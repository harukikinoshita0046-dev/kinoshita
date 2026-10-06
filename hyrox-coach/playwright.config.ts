import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * End-to-end tests on an iPhone-sized viewport. They re-seed the local demo
 * user first (tests/e2e/global-setup.ts), then run serially because they share it.
 */
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  outputDir: "test-results",
  reporter: [["list"]],
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.APP_URL
    ? undefined
    : { command: "npm run start", url: `${baseURL}/login`, reuseExistingServer: true, timeout: 180_000 },
});
