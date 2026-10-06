import { defineConfig } from "@playwright/test";

// Chapters build on each other (one restaurant, set up in chapter 01), so they run in order, one at a time.
export default defineConfig({
  testDir: "./chapters",
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Chapters build on each other; stop at the first failure instead of recording a cascade of failures.
  maxFailures: 1,
  reporter: [["list"], ["json", { outputFile: `${process.env.RECORD_RUN_DIR ?? "."}/results.json` }]],
  globalSetup: "./global-setup.ts",
  outputDir: `${process.env.RECORD_RUN_DIR ?? "."}/traces`,
  use: { trace: "retain-on-failure", actionTimeout: 20_000, navigationTimeout: 45_000 },
});
