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

// What happened during a stage, with times in seconds from the start of its video. Written to raw/<id>/log.json
// and used by the runner for BUGS.md: captions become reproduction steps, actions show what was done last,
// evidence becomes warnings.
type Actor = "admin" | "store";
interface StageLog {
  id: string;
  chapter: string;
  startedAt: number;
  steps: { at: number; where: string; text: string }[];
  actions: { at: number; actor: Actor; action: string; target: string }[];
  evidence: { at: number; actor: Actor; kind: "console-error" | "page-error" | "server-error" | "request-failed" | "slow-request"; message: string; url?: string }[];
}
interface OpenStage { log: StageLog; pages: Record<Actor, Page>; failed: boolean; close: () => Promise<void> }
const openStages = new Set<OpenStage>();
let currentChapter = "";
const chapterCleanups: (() => Promise<unknown>)[] = [];

/** Runs when the chapter ends, pass or fail (e.g. undo an environment change so later chapters aren't affected). */
export function afterChapter(fn: () => Promise<unknown>) {
  chapterCleanups.push(fn);
}
async function runChapterCleanups() {
  for (const fn of chapterCleanups.splice(0).reverse()) await fn().catch(() => {});
}
const pageStage = new WeakMap<Page, { stage: OpenStage; actor: Actor }>();
const SLOW_REQUEST_MS = 5000;
const OWN_HOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

const since = (log: StageLog) => Math.round((Date.now() - log.startedAt) / 100) / 10;
function note(page: Page, action: string, locator: Locator) {
  const owner = pageStage.get(page);
  if (owner) owner.stage.log.actions.push({ at: since(owner.stage.log), actor: owner.actor, action, target: String(locator) });
}

// Chapter results, shared across Playwright workers (a failure restarts the worker) and read by the runner.
type ChapterStatus = { status: "passed" | "failed" | "blocked"; title: string; stage?: string; failedAt?: number; videoAt?: number; error?: string; location?: string; blockedBy?: string[] };
const statusFile = () => join(env.runDir, "raw", "status.json");
const readStatus = (): Record<string, ChapterStatus> => (existsSync(statusFile()) ? JSON.parse(readFileSync(statusFile(), "utf8")) : {});
function writeStatus(id: string, status: ChapterStatus) {
  writeFileSync(statusFile(), JSON.stringify({ ...readStatus(), [id]: status }, null, 2));
}
const dependencies: Record<string, string[]> = JSON.parse(readFileSync(new URL("../chapters.json", import.meta.url), "utf8"));

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

async function recordFailure(id: string, title: string, error: unknown) {
  if (readStatus()[id]?.status === "failed") return;
  const failedAt = Date.now();
  const stages = [...openStages];
  const stage = stages.at(-1);
  for (const s of stages) {
    s.failed = true;
    const dir = join(env.runDir, "failures", s.log.id);
    mkdirSync(dir, { recursive: true });
    for (const [actor, page] of Object.entries(s.pages)) await page.screenshot({ path: join(dir, `${actor}.png`) }).catch(() => {});
  }
  const err = error instanceof Error ? error : new Error(String(error));
  const location = /chapters\/[\w.-]+\.spec\.ts:\d+/.exec(err.stack ?? "")?.[0];
  writeStatus(id, {
    status: "failed", title, stage: stage?.log.id, failedAt, videoAt: stage ? (failedAt - stage.log.startedAt) / 1000 : undefined,
    error: stripAnsi(err.message), location,
  });
}

/**
 * Declares a chapter. If it fails part-way, its videos are still finished and saved so the failure can be watched,
 * with a screenshot and trace in failures/<stage>/. A chapter whose dependency (chapters.json) failed or was
 * blocked is skipped as blocked; the rest of the run continues.
 */
export function chapter(title: string, body: () => Promise<void>) {
  const id = title.split(" ")[0]!;
  test(title, async () => {
    currentChapter = id;
    const statuses = readStatus();
    const blockedBy = (dependencies[id] ?? []).filter((d) => ["failed", "blocked"].includes(statuses[d]?.status ?? ""));
    if (blockedBy.length) {
      writeStatus(id, { status: "blocked", title, blockedBy });
      test.skip(true, `blocked by ${blockedBy.join(", ")}`);
    }
    try {
      await body();
      writeStatus(id, { status: "passed", title });
    } catch (error) {
      await recordFailure(id, title, error);
      throw error;
    } finally {
      for (const s of [...openStages]) await s.close().catch(() => {});
      await runChapterCleanups();
    }
  });
  // A test timeout abandons the body, so its catch/finally may not run before the worker is torn down.
  test.afterEach(async () => {
    const info = test.info();
    if (info.status === "passed" || info.status === "skipped" || !openStages.size) return;
    await recordFailure(id, title, info.error?.message ? new Error(info.error.message) : new Error(`chapter ${info.status}`));
    for (const s of [...openStages]) await s.close().catch(() => {});
    await runChapterCleanups();
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
  note(page, "click", locator);
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
  note(page, `type "${text.length > 40 ? `${text.slice(0, 40)}…` : text}" into`, locator);
  // Forms can re-render as they settle (e.g. Clerk's sign-in); if the field is replaced mid-action, retry once.
  for (let attempt = 0; ; attempt++) {
    try {
      await point(page, locator);
      await locator.click();
      if (options.clear !== false) await locator.fill("");
      await locator.pressSequentially(text, { delay: 35 });
      break;
    } catch (error) {
      if (attempt > 0 || !/not attached|detached/i.test(String(error))) throw error;
      await sleep(600);
    }
  }
  await sleep(200);
}

/**
 * Opens a chapter. Browser state (admin login, storefront preview cookie, cart) carries over from the previous
 * chapter automatically; pass `fresh: true` for a brand-new browser (e.g. a different person).
 */
export async function openStage(id: string, title: string, summary: string, options: { adminState?: string; storeState?: string; fresh?: boolean; freshStore?: boolean } = {}): Promise<Stage> {
  browser ??= await chromium.launch({ slowMo: 60, headless: process.env.RECORD_HEADED !== "1" });
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
  // Playwright's `trace` option only covers its own fixtures, so trace these contexts here (kept only on failure).
  for (const context of [adminContext, storeContext]) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await overlay(adminContext);
  await overlay(storeContext);
  const log: StageLog = { id, chapter: currentChapter, startedAt: Date.now(), steps: [], actions: [], evidence: [] };
  const admin = await adminContext.newPage();
  const store = await storeContext.newPage();
  await setupClerkTestingToken({ page: admin });
  collectEvidence(adminContext, "admin", log);
  collectEvidence(storeContext, "store", log);

  const say = async (text: string, where: "both" | "admin" | "store" = "both") => {
    log.steps.push({ at: since(log), where, text });
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
    openStages.delete(stage);
    // A failed stage may have left the browser somewhere unexpected (e.g. signed in as another person), so the
    // next chapter starts from the last good session instead.
    if (!stage.failed) {
      if (!options.fresh || options.adminState) await adminContext.storageState({ path: join(env.workDir, "admin.storage.json") }).catch(() => {});
      await storeContext.storageState({ path: join(env.workDir, "store.storage.json") }).catch(() => {});
    }
    const failureDir = join(env.runDir, "failures", id);
    for (const [actor, context] of [["admin", adminContext], ["store", storeContext]] as const) {
      await context.tracing.stop(stage.failed ? { path: join(failureDir, `${actor}-trace.zip`) } : {}).catch(() => {});
    }
    const adminVideo = admin.video();
    const storeVideo = store.video();
    await adminContext.close();
    await storeContext.close();
    const a = join(rawDir, "admin.webm");
    const s = join(rawDir, "store.webm");
    if (adminVideo) renameSync(await adminVideo.path(), a);
    if (storeVideo) renameSync(await storeVideo.path(), s);
    writeFileSync(join(rawDir, "log.json"), JSON.stringify(log, null, 2));
    const manifestFile = join(env.runDir, "raw", "manifest.json");
    const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) as { id: string }[] : [];
    const entry = { id, chapter: log.chapter, title, summary, status: stage.failed ? "failed" : "passed", admin: relative(env.runDir, a), store: relative(env.runDir, s), log: relative(env.runDir, join(rawDir, "log.json")) };
    writeFileSync(manifestFile, JSON.stringify([...manifest.filter((m) => m.id !== id), entry].sort((x, y) => x.id.localeCompare(y.id)), null, 2));
  };

  const stage: OpenStage = { log, pages: { admin, store }, failed: false, close };
  openStages.add(stage);
  pageStage.set(admin, { stage, actor: "admin" });
  pageStage.set(store, { stage, actor: "store" });
  await card(`Chapter ${id.slice(0, 2)}`, title, summary, 2800);
  return { admin, store, adminContext, storeContext, say, card, close };
}

/** Problems the user wouldn't necessarily see, collected even when the chapter passes (BUGS.md warnings). */
function collectEvidence(context: BrowserContext, actor: Actor, log: StageLog) {
  const add = (kind: StageLog["evidence"][number]["kind"], message: string, url?: string) => log.evidence.push({ at: since(log), actor, kind, message: message.slice(0, 500), url });
  context.on("console", (msg) => {
    // Failed loads are reported by the network listeners below (4xx responses are often expected, e.g. validation).
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) add("console-error", msg.text(), msg.page()?.url());
  });
  context.on("weberror", (e) => add("page-error", e.error().message, e.page()?.url()));
  context.on("response", (r) => { if (r.status() >= 500) add("server-error", `${r.request().method()} ${r.status()} ${r.statusText()}`, r.url()); });
  context.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "failed";
    // Navigations, prefetches and polling cancelled by the page itself are not failures.
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(reason)) add("request-failed", `${r.method()} ${reason}`, r.url());
  });
  context.on("requestfinished", (r) => {
    const ms = r.timing().responseEnd;
    // Only this app's own servers; third-party latency (e.g. Clerk's development instance) isn't actionable here.
    if (ms > SLOW_REQUEST_MS && OWN_HOST.test(r.url()) && ["fetch", "xhr", "document"].includes(r.resourceType())) add("slow-request", `${r.method()} took ${(ms / 1000).toFixed(1)} s`, r.url());
  });
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
