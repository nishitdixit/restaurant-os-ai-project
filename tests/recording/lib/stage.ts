// A "stage" is one chapter: an admin window (desktop) and a storefront window (phone) recorded at the same
// time, so admin changes can be watched arriving on the customer side.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { chromium, devices, expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { overlayInit } from "./overlay.ts";

export const env = {
  runDir: process.env.RECORD_RUN_DIR!,
  workDir: process.env.RECORD_WORK_DIR!,
  databaseUrl: process.env.RECORD_DATABASE_URL!,
  control: process.env.RECORD_CONTROL_URL!,
  storefront: process.env.RECORD_STOREFRONT_URL!,
  admin: process.env.RECORD_ADMIN_URL!,
  api: process.env.RECORD_API_URL!,
  slug: process.env.RECORD_STORE_SLUG!,
  userPrefix: process.env.RECORD_USER_PREFIX ?? "ros-rec-",
};

const ADMIN_SIZE = { width: 1280, height: 800 };
const STORE_SIZE = { width: 430, height: 800 };
const PACE = Number(process.env.RECORD_PACE ?? "1");

/** Shared state between chapters (one restaurant across the whole run). */
export function state<T extends Record<string, unknown>>(): T & { save: (patch: Partial<T>) => void } {
  const file = join(env.workDir, "state.json");
  const data = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return Object.assign(data, {
    save: (patch: Partial<T>) => {
      Object.assign(data, patch);
      writeFileSync(file, JSON.stringify({ ...JSON.parse(existsSync(file) ? readFileSync(file, "utf8") : "{}"), ...patch }, null, 2));
    },
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms * PACE));

export interface Stage {
  admin: Page;
  store: Page;
  adminContext: BrowserContext;
  storeContext: BrowserContext;
  /** Caption on both windows (or one). */
  say: (text: string, where?: "both" | "admin" | "store") => Promise<void>;
  /** Full-screen title card on both windows. */
  card: (kicker: string, title: string, body?: string, ms?: number) => Promise<void>;
  /** Opens a new storefront context (e.g. a second customer); recorded in place of the current one when `replace`. */
  close: () => Promise<void>;
}

let browser: Browser | undefined;
const openStages = new Set<() => Promise<void>>();

/** Declares a chapter. If it fails part-way, its videos are still finished and saved so the failure can be watched. */
export function chapter(title: string, body: () => Promise<void>) {
  test(title, async () => {
    try {
      await body();
    } finally {
      for (const close of [...openStages]) await close().catch(() => {});
    }
  });
}

function pickState(explicit: string | undefined, name: "admin" | "store", fresh?: boolean) {
  if (explicit && existsSync(explicit)) return explicit;
  if (fresh) return undefined;
  const carried = join(env.workDir, `${name}.storage.json`);
  return existsSync(carried) ? carried : undefined;
}

async function overlay(context: BrowserContext) {
  await context.addInitScript(overlayInit);
}

/** Moves the visible cursor to an element before acting, so viewers can follow along. */
export async function point(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20), { steps: 12 });
  await sleep(180);
}

export async function click(page: Page, locator: Locator) {
  // Live screens re-render on their refresh interval; if the element is replaced mid-action, retry once.
  for (let attempt = 0; ; attempt++) {
    try {
      await point(page, locator);
      await locator.click();
      break;
    } catch (error) {
      if (attempt > 0 || !/not attached|detached/i.test(String(error))) throw error;
      await sleep(400);
    }
  }
  await sleep(350);
}

export async function type(page: Page, locator: Locator, text: string, options: { clear?: boolean } = {}) {
  await point(page, locator);
  await locator.click();
  if (options.clear !== false) await locator.fill("");
  await locator.pressSequentially(text, { delay: 35 });
  await sleep(200);
}

/**
 * Opens a chapter. Browser state (admin login, storefront preview cookie, cart) carries over from the previous
 * chapter automatically; pass `fresh: true` for a brand-new browser (e.g. a different person).
 */
export async function openStage(id: string, title: string, summary: string, options: { adminState?: string; storeState?: string; fresh?: boolean; freshStore?: boolean } = {}): Promise<Stage> {
  browser ??= await chromium.launch({ slowMo: 60 });
  const rawDir = join(env.runDir, "raw", id);
  mkdirSync(rawDir, { recursive: true });
  const adminContext = await browser.newContext({
    viewport: ADMIN_SIZE, recordVideo: { dir: join(rawDir, "admin"), size: ADMIN_SIZE }, locale: "en-IN", timezoneId: "Asia/Kolkata",
    storageState: pickState(options.adminState, "admin", options.fresh),
    permissions: ["geolocation"], geolocation: { latitude: 12.9719, longitude: 77.6412 },
  });
  const storeContext = await browser.newContext({
    ...devices["Pixel 7"], viewport: STORE_SIZE, screen: STORE_SIZE, recordVideo: { dir: join(rawDir, "store"), size: STORE_SIZE }, locale: "en-IN", timezoneId: "Asia/Kolkata",
    storageState: pickState(options.storeState, "store", options.fresh || options.freshStore),
    permissions: ["geolocation"], geolocation: { latitude: 12.9719, longitude: 77.6412 },
  });
  await overlay(adminContext);
  await overlay(storeContext);
  const admin = await adminContext.newPage();
  const store = await storeContext.newPage();
  await setupClerkTestingToken({ page: admin });

  const say = async (text: string, where: "both" | "admin" | "store" = "both") => {
    const pages = where === "both" ? [admin, store] : where === "admin" ? [admin] : [store];
    await Promise.all(pages.map((p) => p.evaluate((t) => (window as unknown as { __rosCaption?: (t: string) => void }).__rosCaption?.(t), text).catch(() => {})));
    await sleep(900);
  };
  const card = async (kicker: string, heading: string, body = "", ms = 2600) => {
    for (const p of [admin, store]) {
      if (p.url() === "about:blank") await p.setContent("<html><body style='background:#111827'></body></html>");
      await p.evaluate(([k, h, b]) => (window as unknown as { __rosCard?: (k: string, h: string, b: string) => void }).__rosCard?.(k!, h!, b!), [kicker, heading, body]).catch(() => {});
    }
    await sleep(ms);
    for (const p of [admin, store]) await p.evaluate(() => (window as unknown as { __rosCard?: (k: string, h: string) => void }).__rosCard?.("", "")).catch(() => {});
  };

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    openStages.delete(close);
    if (!options.fresh || options.adminState) await adminContext.storageState({ path: join(env.workDir, "admin.storage.json") }).catch(() => {});
    await storeContext.storageState({ path: join(env.workDir, "store.storage.json") }).catch(() => {});
    const adminVideo = admin.video();
    const storeVideo = store.video();
    await adminContext.close();
    await storeContext.close();
    const a = join(rawDir, "admin.webm");
    const s = join(rawDir, "store.webm");
    if (adminVideo) renameSync(await adminVideo.path(), a);
    if (storeVideo) renameSync(await storeVideo.path(), s);
    const manifestFile = join(env.runDir, "raw", "manifest.json");
    const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) as { id: string }[] : [];
    const entry = { id, title, summary, admin: relative(env.runDir, a), store: relative(env.runDir, s) };
    writeFileSync(manifestFile, JSON.stringify([...manifest.filter((m) => m.id !== id), entry].sort((x, y) => x.id.localeCompare(y.id)), null, 2));
  };

  openStages.add(close);
  await card(`Chapter ${id.slice(0, 2)}`, title, summary, 2800);
  return { admin, store, adminContext, storeContext, say, card, close };
}

/**
 * Refreshes the storefront until a change made in the admin is visible. Public pages are cached briefly
 * (store settings up to ~30 s, menu up to ~15 s), so a customer may need to refresh more than once.
 * Returns the seconds it took, which chapters show in a caption.
 */
export async function refreshUntil(page: Page, locator: Locator, timeoutMs = 120_000): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await page.reload();
    if (await locator.first().isVisible().catch(() => false)) {
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`[refreshUntil] visible after ${seconds}s: ${locator}`);
      return seconds;
    }
    await page.waitForTimeout(5000);
  }
  await expect(locator.first()).toBeVisible();
  return Math.round((Date.now() - started) / 1000);
}

/** Refreshes until something disappears (e.g. a "paused" banner after ordering resumes). */
export async function refreshUntilGone(page: Page, locator: Locator, timeoutMs = 120_000): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await page.reload();
    if (!(await locator.first().isVisible().catch(() => false))) return Math.round((Date.now() - started) / 1000);
    await page.waitForTimeout(5000);
  }
  await expect(locator.first()).toBeHidden();
  return Math.round((Date.now() - started) / 1000);
}

export async function saveAuth(context: BrowserContext, name: string): Promise<string> {
  const file = join(env.workDir, `${name}.storage.json`);
  await context.storageState({ path: file });
  return file;
}

export async function restartWorker(mode: "succeed" | "fail" | "flaky") {
  await fetch(`${env.control}/worker?mode=${mode}`);
}

export { expect };
