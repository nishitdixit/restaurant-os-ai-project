#!/usr/bin/env node
// Recorded walkthrough of the admin and storefront running together.
//
//   pnpm record                      full run -> recordings/<YYYY-MM-DD_HHmm>/ (with BUGS.md)
//   pnpm record --flows 10,13        only these chapters, plus the chapters they depend on (chapters.json)
//   pnpm record --skip-build         reuse the last recording build of the web apps
//   pnpm record --headed             show the browsers
//   pnpm record --keep 3             afterwards, keep only the newest 3 fully passing runs (failed runs are never deleted)
//   pnpm record --serve              start the isolated stack and keep it running (no recording)
//
// Everything runs in isolation: a throwaway PostgreSQL, an in-memory Redis, separate ports
// (API 4100, storefront 3100, admin 3101) and separate Next.js build directories (.next-recording).
// Test users are created in the Clerk development instance and deleted at the end.
// No application code or configuration is changed; only environment values differ.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { connect as tcpConnect } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import EmbeddedPostgres from "embedded-postgres";
import { RedisMemoryServer } from "redis-memory-server";
import { createClerkClient } from "@clerk/backend";
import ffmpegPath from "ffmpeg-static";
import { fmt, pruneRuns, writeIndex, writeReports } from "./report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const PORTS = { api: 4100, storefront: 3100, admin: 3101, control: 4199 };
const URLS = { api: `http://localhost:${PORTS.api}`, storefront: `http://localhost:${PORTS.storefront}`, admin: `http://localhost:${PORTS.admin}` };
export const STORE_SLUG = "spice-route";
const USER_PREFIX = "ros-rec-";

const processes = new Map();
const cleanups = [];
const log = (...m) => console.log(`[record ${new Date().toISOString().slice(11, 19)}]`, ...m);

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
}

function start(name, command, commandArgs, options) {
  const child = spawn(command, commandArgs, { ...options, stdio: ["ignore", "pipe", "pipe"], detached: false });
  const logFile = join(options.logDir, `${name}.log`);
  // Each line is prefixed with the UTC time so BUGS.md can quote the log lines around a failure.
  let buffer = "";
  let partial = "";
  const write = (chunk) => {
    const lines = (partial + chunk).split("\n");
    partial = lines.pop();
    const stamp = `[${new Date().toISOString().slice(11, 23)}] `;
    for (const line of lines) buffer += `${stamp}${line}\n`;
    if (buffer.length > 2_000_000) buffer = buffer.slice(-1_000_000);
  };
  child.stdout.on("data", write);
  child.stderr.on("data", write);
  child.on("exit", (code) => { writeFileSync(logFile, buffer); if (code && !child.killedByUs) log(`${name} exited with ${code} (see ${logFile})`); });
  processes.set(name, { child, flush: () => writeFileSync(logFile, buffer) });
  return child;
}

async function stop(name) {
  const p = processes.get(name);
  if (!p) return;
  p.child.killedByUs = true;
  p.child.kill("SIGTERM");
  await new Promise((r) => { const t = setTimeout(() => { p.child.kill("SIGKILL"); r(); }, 8000); p.child.once("exit", () => { clearTimeout(t); r(); }); });
  p.flush();
  processes.delete(name);
}

/** True when something already listens on the port (e.g. a stack left over from an interrupted run). */
function portInUse(port) {
  return new Promise((resolvePort) => {
    const socket = tcpConnect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(false));
  });
}

async function waitFor(url, label, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

/** --flows: the requested chapters plus everything they depend on, as spec files in run order. */
function chapterFiles(requested) {
  const deps = JSON.parse(readFileSync(join(here, "chapters.json"), "utf8"));
  const wanted = new Set();
  const add = (id) => {
    if (!(id in deps)) throw new Error(`Unknown chapter "${id}" (see tests/recording/chapters.json)`);
    if (wanted.has(id)) return;
    wanted.add(id);
    deps[id].forEach(add);
  };
  requested.split(",").map((c) => c.trim()).filter(Boolean).forEach(add);
  const files = readdirSync(join(here, "chapters")).filter((f) => f.endsWith(".spec.ts")).sort();
  return [...wanted].sort().map((id) => {
    const file = files.find((f) => f.startsWith(`${id}-`));
    if (!file) throw new Error(`No spec file for chapter ${id}`);
    return `chapters/${file}`;
  });
}

async function freshDatabase(tmp) {
  const port = 54400 + Math.floor(Math.random() * 400);
  const server = new EmbeddedPostgres({ databaseDir: join(tmp, "pg"), port, user: "postgres", password: "postgres", persistent: false, onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  cleanups.push(() => server.stop());
  const admin = new pg.Client({ connectionString: `postgresql://postgres:postgres@localhost:${port}/postgres` });
  await admin.connect();
  await admin.query("CREATE DATABASE restaurant_os");
  await admin.end();
  const url = `postgresql://postgres:postgres@localhost:${port}/restaurant_os`;
  execFileSync("node", [join(root, "db/scripts/migrate.mjs")], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  return url;
}

async function clerkCleanup(clerk) {
  let removed = 0;
  for (let offset = 0; ; offset += 100) {
    const page = await clerk.users.getUserList({ limit: 100, offset, query: USER_PREFIX });
    const users = page.data ?? page;
    for (const u of users) {
      if (u.emailAddresses.some((e) => e.emailAddress.startsWith(USER_PREFIX))) { await clerk.users.deleteUser(u.id); removed++; }
    }
    if (users.length < 100) break;
  }
  return removed;
}

function runStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function gitInfo() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root }).toString().trim().length > 0;
    return `${sha}${dirty ? " (with uncommitted changes)" : ""}`;
  } catch {
    return "not a git repository";
  }
}

/** Side-by-side (admin left, storefront right) composition of one chapter's two recordings. */
function compose(adminVideo, storeVideo, out, title) {
  const height = 800;
  execFileSync(ffmpegPath, [
    "-y", "-i", adminVideo, "-i", storeVideo,
    "-filter_complex",
    `[0:v]scale=-2:${height},setsar=1[a];[1:v]scale=-2:${height},setsar=1[b];[a][b]hstack=inputs=2:shortest=0,format=yuv420p[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-r", "25", "-movflags", "+faststart",
    "-metadata", `title=${title}`, out,
  ], { stdio: "pipe" });
}

function concat(files, out) {
  const list = join(dirname(out), ".concat.txt");
  writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  execFileSync(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out], { stdio: "pipe" });
  rmSync(list);
}

function duration(file) {
  try {
    execFileSync(ffmpegPath, ["-i", file], { stdio: "pipe" });
  } catch (e) {
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr));
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
}


async function main() {
  const adminEnv = readEnvFile(join(root, "apps/admin/.env.local"));
  const apiEnv = readEnvFile(join(root, "apps/api/.env"));
  const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY ?? adminEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? adminEnv.CLERK_SECRET_KEY ?? apiEnv.CLERK_SECRET_KEY;
  if (!CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") || !CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Recording needs Clerk development keys (pk_test_/sk_test_) in apps/admin/.env.local.");
  }

  const chapters = option("flows") ?? option("chapters");
  const files = chapters ? chapterFiles(chapters) : [];
  const stamp = runStamp();
  const runDir = flag("serve") ? mkdtempSync(join(tmpdir(), "ros-serve-")) : join(root, "recordings", stamp);
  const workDir = mkdtempSync(join(tmpdir(), "ros-recording-"));
  const logDir = join(runDir, "logs");
  for (const d of ["raw", "chapters", "logs", "failures"]) mkdirSync(join(runDir, d), { recursive: true });
  cleanups.push(() => rmSync(workDir, { recursive: true, force: true }));
  log(`output: ${runDir}`);
  // A full run takes ~45 min; if the Mac idles to sleep, timers freeze and chapters time out. Keep it awake
  // until this process exits (closing the lid on battery still sleeps).
  if (process.platform === "darwin") {
    const awake = spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
    awake.on("error", () => log("caffeinate unavailable; keep the machine awake during the run"));
    cleanups.push(() => awake.kill());
  }

  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  const stale = await clerkCleanup(clerk);
  if (stale) log(`removed ${stale} leftover recording users from Clerk`);

  const busy = [];
  for (const port of Object.values(PORTS)) if (await portInUse(port)) busy.push(port);
  if (busy.length) throw new Error(`Port(s) ${busy.join(", ")} already in use — stop the old process first (lsof -ti :${busy[0]} | xargs kill).`);
  log("starting PostgreSQL and Redis");
  const DATABASE_URL = await freshDatabase(workDir);
  const redis = await RedisMemoryServer.create();
  cleanups.push(() => redis.stop());
  const REDIS_URL = `redis://${await redis.getHost()}:${await redis.getPort()}`;

  const apiProcessEnv = {
    ...process.env, NODE_ENV: "development", LOG_LEVEL: "info", PORT: String(PORTS.api), DATABASE_URL, REDIS_URL,
    CLERK_SECRET_KEY, SELF_SIGNUP_ENABLED: "true", CORS_ORIGINS: `${URLS.storefront},${URLS.admin}`, STOREFRONT_URL: URLS.storefront,
    ADMIN_URL: URLS.admin, API_PUBLIC_URL: URLS.api, MEDIA_DIR: join(workDir, "media"), PAYMENT_PROVIDER: "mock", PAYMENT_WINDOW_MINUTES: "5",
    MOCK_NOTIFICATION_MODE: "succeed", NOTIFICATION_MAX_ATTEMPTS: "3",
  };
  const webEnv = {
    ...process.env, NEXT_DIST_DIR: ".next-recording", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_API_BASE_URL: URLS.api, API_INTERNAL_URL: URLS.api, NEXT_PUBLIC_SITE_URL: URLS.storefront, NEXT_PUBLIC_STORE_BRAND_SLUG: STORE_SLUG,
    NEXT_PUBLIC_STOREFRONT_URL: URLS.storefront, NEXT_PUBLIC_ADMIN_URL: URLS.admin, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in", NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
  };
  const nextBin = join(root, "apps/storefront/node_modules/.bin/next");
  const adminNext = join(root, "apps/admin/node_modules/.bin/next");

  // Next.js keeps fetched data under <distDir>/cache; clear it so no data from an earlier run (same URLs,
  // different database) leaks into this recording.
  for (const app of ["storefront", "admin"]) rmSync(join(root, "apps", app, ".next-recording", "cache"), { recursive: true, force: true });
  if (!flag("skip-build")) {
    log("building storefront and admin (recording build directory)");
    execFileSync(nextBin, ["build"], { cwd: join(root, "apps/storefront"), env: webEnv, stdio: "pipe" });
    execFileSync(adminNext, ["build"], { cwd: join(root, "apps/admin"), env: webEnv, stdio: "pipe" });
  }

  log("starting API, worker, storefront and admin");
  const tsx = join(root, "apps/api/node_modules/.bin/tsx");
  const startApi = () => start("api", tsx, ["src/main.ts"], { cwd: join(root, "apps/api"), env: apiProcessEnv, logDir });
  startApi();
  const startWorker = (mode = "succeed") => start("worker", tsx, ["src/worker.ts"], { cwd: join(root, "apps/api"), env: { ...apiProcessEnv, MOCK_NOTIFICATION_MODE: mode }, logDir });
  startWorker();
  start("storefront", nextBin, ["start", "-p", String(PORTS.storefront)], { cwd: join(root, "apps/storefront"), env: webEnv, logDir });
  start("admin", adminNext, ["start", "-p", String(PORTS.admin)], { cwd: join(root, "apps/admin"), env: webEnv, logDir });
  await waitFor(`${URLS.api}/ready`, "API");
  await waitFor(`${URLS.storefront}/robots.txt`, "storefront");
  await waitFor(`${URLS.admin}/sign-in`, "admin");

  // Control channel for chapters that need to restart the worker in another mode.
  const control = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/worker") {
      await stop("worker");
      startWorker(url.searchParams.get("mode") ?? "succeed");
      await new Promise((r) => setTimeout(r, 4000));
      res.end("ok");
      return;
    }
    if (url.pathname === "/restart-api") {
      await stop("api");
      startApi();
      await waitFor(`${URLS.api}/ready`, "API");
      res.end("ok");
      return;
    }
    res.statusCode = 404;
    res.end();
  }).listen(PORTS.control);
  cleanups.push(() => new Promise((r) => control.close(r)));

  if (flag("serve")) {
    log(`stack running: storefront ${URLS.storefront}  admin ${URLS.admin}  api ${URLS.api}  db ${DATABASE_URL}  (Ctrl+C to stop)`);
    await new Promise((r) => { process.once("SIGINT", r); process.once("SIGTERM", r); });
    return;
  }

  log(`recording ${files.length ? files.map((f) => f.slice(9).split("-")[0]).join(", ") : "all chapters"}`);
  const testEnv = {
    ...process.env, RECORD_RUN_DIR: runDir, RECORD_WORK_DIR: workDir, RECORD_DATABASE_URL: DATABASE_URL, RECORD_CONTROL_URL: `http://localhost:${PORTS.control}`,
    RECORD_STOREFRONT_URL: URLS.storefront, RECORD_ADMIN_URL: URLS.admin, RECORD_API_URL: URLS.api, RECORD_STORE_SLUG: STORE_SLUG, RECORD_USER_PREFIX: USER_PREFIX,
    CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, RECORD_HEADED: flag("headed") ? "1" : "0",
  };
  const pwArgs = ["playwright", "test", "-c", join(here, "playwright.config.ts")];
  pwArgs.push(...files);
  // Async on purpose: while the chapters run, this process must keep serving the control channel (worker restarts)
  // and draining the servers' stdout/stderr pipes (a full pipe would stall the API and worker).
  const exitCode = await new Promise((resolve) => {
    const pw = spawn(join(here, "node_modules/.bin/playwright"), pwArgs.slice(1), { cwd: here, env: testEnv, stdio: "inherit" });
    pw.on("exit", (code) => resolve(code ?? 1));
    pw.on("error", () => resolve(1));
  });
  const testsPassed = exitCode === 0;
  if (!testsPassed) log("some chapters failed; composing what was recorded");

  log("composing videos");
  const manifestPath = join(runDir, "raw", "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
  const composed = [];
  let offset = 0;
  for (const entry of manifest) {
    const out = join(runDir, "chapters", `${entry.id}.mp4`);
    try {
      compose(join(runDir, entry.admin), join(runDir, entry.store), out, entry.title);
      const seconds = duration(out);
      composed.push({ ...entry, file: out, seconds, offset });
      offset += seconds;
    } catch (error) {
      log(`could not compose ${entry.id}: ${error.message}`);
    }
  }
  const walkthrough = "restaurant-os-walkthrough.mp4";
  if (composed.length) concat(composed.map((c) => c.file), join(runDir, walkthrough));

  const recordingsDir = join(root, "recordings");
  const code = gitInfo();
  const { summary, bugs, status } = writeReports({ runDir, stamp, code, composed, walkthrough });
  const bugLink = (b) => `[BUG-${String(b.n).padStart(2, "0")}](BUGS.md#bug-${String(b.n).padStart(2, "0")})`;
  const rows = composed.map((c) => {
    const bug = bugs.find((b) => b.stage === c.id);
    return `| ${fmt(c.offset)} | [${c.id}](chapters/${c.id}.mp4) | ${c.title} | ${fmt(c.seconds)} | ${bug ? `❌ ${bugLink(bug)}` : "✅"} |\n|  |  | ${c.summary} |  |  |`;
  });
  const notRecorded = Object.values(status).filter((st) => st.status === "blocked" || (st.status === "failed" && !st.stage))
    .map((st) => `- ${st.title} — ${st.status === "blocked" ? `⏭ blocked by ${st.blockedBy.join(", ")}` : `❌ failed before recording (${bugLink(bugs.find((b) => b.title === st.title))})`}`);
  const failing = summary.failed || summary.blocked;
  writeFileSync(join(runDir, "README.md"), `# Restaurant OS walkthrough — ${stamp.replace("_", " ")}

Code: ${code} · Result: ${failing ? `❌ ${summary.failed} failed, ${summary.blocked} blocked, ${summary.passed} passed` : `✅ all ${summary.passed} chapters passed`} · Bugs and warnings (${summary.warnings}): [BUGS.md](BUGS.md)

Left: admin (desktop, 1280×800). Right: customer storefront (phone, 430×800). Both run at the same time against
the same API, so changes made in the admin can be watched arriving on the storefront.

How the two stay in sync: the storefront caches public pages briefly — store settings up to ~30 s, the menu up to
~15 s — so a refresh after that shows changes; checkout prices, stock and opening state are always checked live; the admin order board refreshes
every 10 s and the customer's order page every 15 s. Payments and customer messages run in test mode (ADR-010).

Full video: [${walkthrough}](${walkthrough}) (${fmt(offset)})

| Starts at | Chapter | What it shows | Length | Result |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
${notRecorded.length ? `\nNot recorded:\n${notRecorded.join("\n")}\n` : ""}
Folders: \`chapters/\` side-by-side videos, \`failures/\` everything about each failed chapter (video, screenshots,
Playwright traces — \`npx playwright show-trace <file>\` — and its step log), \`raw/\` the original admin and
storefront recordings with step logs, \`logs/\` server logs from this run (each line prefixed with UTC time).
`);

  const keep = option("keep");
  if (keep) {
    const removed = pruneRuns(recordingsDir, Number(keep), stamp, !failing);
    if (removed.length) log(`--keep ${keep}: removed older fully passing runs ${removed.join(", ")}`);
  }
  writeIndex(recordingsDir);

  log(`done: ${join(runDir, "README.md")}`);
  console.log(`\n${failing ? "❌" : "✅"} ${summary.passed} passed, ${summary.failed} failed, ${summary.blocked} blocked, ${summary.warnings} warnings`);
  for (const b of bugs) console.log(`  BUG-${String(b.n).padStart(2, "0")} ${b.title}: ${b.error.slice(0, 140)}${b.video ? `\n         ${join(runDir, b.video)}` : ""}`);
  for (const st of Object.values(status).filter((st) => st.status === "blocked")) console.log(`  blocked: ${st.title} (by ${st.blockedBy.join(", ")})`);
  console.log(`  report: ${join(runDir, "BUGS.md")}\n`);
  if (!testsPassed || failing) process.exitCode = 1;
}

async function shutdown() {
  for (const name of [...processes.keys()].reverse()) await stop(name).catch(() => {});
  for (const fn of cleanups.reverse()) await Promise.resolve().then(fn).catch(() => {});
  try {
    const adminEnv = readEnvFile(join(root, "apps/admin/.env.local"));
    const key = process.env.CLERK_SECRET_KEY ?? adminEnv.CLERK_SECRET_KEY;
    if (key) {
      const removed = await clerkCleanup(createClerkClient({ secretKey: key }));
      if (removed) log(`deleted ${removed} recording users from Clerk`);
    }
  } catch (e) {
    log(`Clerk cleanup failed: ${e.message}`);
  }
}

// Exit explicitly: embedded-postgres's exit hook (async-exit-hook) calls process.exit() on beforeExit and drops
// process.exitCode, so a failed run would otherwise exit 0.
main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await shutdown(); process.exit(process.exitCode ?? 0); });
