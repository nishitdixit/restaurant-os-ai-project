import { defineConfig } from "@playwright/test";

// Chapters build on each other (one restaurant, set up in chapter 01), so they run in order, one at a time.
// A failed chapter doesn't stop the run: chapters that depend on it (chapters.json) are skipped as blocked, the
// rest still run, so one run reports as many bugs as possible. No retries: a flaky flow is itself a finding.
export default defineConfig({
  testDir: "./chapters",
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: `${process.env.RECORD_RUN_DIR ?? "."}/results.json` }]],
  globalSetup: "./global-setup.ts",
  outputDir: `${process.env.RECORD_RUN_DIR ?? "."}/raw/test-output`,
  // Traces and failure screenshots are taken by lib/stage.ts (the chapters open their own browser contexts).
  use: { actionTimeout: 20_000, navigationTimeout: 45_000 },
});
