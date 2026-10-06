// Run reports, written by run.mjs after the chapters: BUGS.md (failures and warnings, each linked to the video
// at the moment it happened), README.md (the run index), run.json (machine-readable summary) and the
// recordings/README.md list of runs. Also prunes old fully-passing runs for --keep.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
export const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const anchor = (n) => `bug-${String(n).padStart(2, "0")}`; // README.md links to BUGS.md#bug-NN
const shortUrl = (u) => { try { const x = new URL(u); return `${x.host}${x.pathname}`; } catch { return u ?? ""; } };
const LOG_LINE_TIME = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/;
const ERROR_LINE = /"level":(50|60)|\berror\b|Error:|⨯|"statusCode":5\d\d|Unhandled|ECONN/i;

/** Error-looking server log lines from 30 s before to 3 s after the failure (log lines are prefixed with UTC time). */
function logExcerpt(runDir, failedAt) {
  const from = new Date(failedAt - 30_000).toISOString().slice(11, 23);
  const to = new Date(failedAt + 3_000).toISOString().slice(11, 23);
  const out = [];
  for (const file of readdirSync(join(runDir, "logs")).filter((f) => f.endsWith(".log"))) {
    for (const line of readFileSync(join(runDir, "logs", file), "utf8").split("\n")) {
      const t = LOG_LINE_TIME.exec(line)?.[1];
      if (t && t >= from && t <= to && ERROR_LINE.test(line)) out.push(`${file.replace(".log", "")} ${line.length > 320 ? `${line.slice(0, 320)}…` : line}`);
    }
  }
  return out.slice(-15);
}

/** Same problem reported many times (e.g. on every poll) → one warning with a count. */
function groupEvidence(evidence) {
  const groups = new Map();
  for (const e of evidence) {
    const key = `${e.kind}|${e.message.replace(/\d+(\.\d+)? s\b/, "")}|${shortUrl(e.url).replace(/\/[0-9a-f-]{8,}/gi, "/:id")}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { ...e, count: 1 });
  }
  return [...groups.values()];
}

export function writeReports({ runDir, stamp, code, composed, walkthrough }) {
  const status = readJson(join(runDir, "raw", "status.json"), {});
  const results = readJson(join(runDir, "results.json"), null);
  const manifest = readJson(join(runDir, "raw", "manifest.json"), []);
  const byStage = new Map(composed.map((c) => [c.id, c]));

  // Chapters Playwright reported as failed but that never recorded their own status (e.g. crashed before
  // opening a stage) still count as failures.
  for (const suite of results?.suites ?? []) {
    for (const spec of suite.specs ?? []) {
      const id = spec.title.split(" ")[0];
      if (spec.ok || status[id]) continue;
      const error = spec.tests?.[0]?.results?.[0]?.error?.message ?? "failed before the chapter started recording";
      status[id] = { status: "failed", title: spec.title, error: error.replace(/\u001b\[[0-9;]*m/g, "") };
    }
  }

  const ids = Object.keys(status).sort();
  const failedIds = ids.filter((id) => status[id].status === "failed");
  const blockedIds = ids.filter((id) => status[id].status === "blocked");
  const passedIds = ids.filter((id) => status[id].status === "passed");

  // Evidence for failed stages goes to failures/<stage>/ next to the screenshot and trace.
  const bugs = failedIds.map((id, i) => {
    const s = status[id];
    const stage = s.stage ? manifest.find((m) => m.id === s.stage) : undefined;
    const log = stage ? readJson(join(runDir, stage.log), null) : null;
    const dir = s.stage ? join(runDir, "failures", s.stage) : null;
    const video = s.stage && byStage.get(s.stage);
    if (dir) {
      mkdirSync(dir, { recursive: true });
      if (video) copyFileSync(video.file, join(dir, "video.mp4"));
      if (log) writeFileSync(join(dir, "log.json"), JSON.stringify(log, null, 2));
    }
    const has = (f) => dir && existsSync(join(dir, f));
    return { n: i + 1, id, s, log, video, has, rel: s.stage ? `failures/${s.stage}` : null, excerpt: s.failedAt ? logExcerpt(runDir, s.failedAt) : [] };
  });

  // ---------- BUGS.md ----------
  const allEvidence = manifest.flatMap((m) => {
    const log = readJson(join(runDir, m.log ?? ""), null);
    return (log?.evidence ?? []).map((e) => ({ ...e, stage: m.id }));
  });
  const warnings = groupEvidence(allEvidence);
  const errorLines = (msg) => msg.split("\n").filter((l) => l.trim()).slice(0, 14).join("\n");
  const bugSections = bugs.map(({ n, id, s, log, video, has, rel, excerpt }) => {
    const at = s.videoAt ?? 0;
    const firstLine = s.error?.split("\n")[0] ?? "failed";
    const lines = [`<a id="${anchor(n)}"></a>`, `## BUG-${String(n).padStart(2, "0")} · ${s.title} — ${firstLine.slice(0, 120)}`, ""];
    if (rel && video) {
      lines.push(`- **Watch:** [video at ${fmt(at)}](${rel}/video.mp4) (seek to ${fmt(at)}) · in the [full walkthrough](${walkthrough}) at ${fmt(video.offset + at)}`);
    } else lines.push("- **Watch:** no video (the chapter failed before it opened its windows)");
    const lastStep = log?.steps.filter((st) => st.at <= at).at(-1);
    if (lastStep) lines.push(`- **During:** caption at ${fmt(lastStep.at)} — ${lastStep.text}`);
    if (s.location) lines.push(`- **Check that failed:** \`tests/recording/${s.location}\``);
    lines.push("- **Error:**", "", "  ```", ...errorLines(s.error ?? "").split("\n").map((l) => `  ${l}`), "  ```", "");
    if (log?.steps.length) {
      lines.push("- **Steps to reproduce** (the chapter's captions up to the failure; the chapter's dependencies ran first):", "");
      log.steps.filter((st) => st.at <= at).forEach((st, k) => lines.push(`  ${k + 1}. [${fmt(st.at)}] ${st.where === "both" ? "" : `(${st.where}) `}${st.text}`));
      lines.push("");
    }
    const actions = (log?.actions ?? []).filter((a) => a.at <= at).slice(-8);
    if (actions.length) {
      lines.push("- **Last actions:**", "");
      for (const a of actions) lines.push(`  - [${fmt(a.at)}] ${a.actor}: ${a.action} \`${a.target}\``);
      lines.push("");
    }
    const evidence = [
      has("admin.png") && `[admin screenshot](${rel}/admin.png)`, has("store.png") && `[storefront screenshot](${rel}/store.png)`,
      has("admin-trace.zip") && `[admin trace](${rel}/admin-trace.zip)`, has("store-trace.zip") && `[storefront trace](${rel}/store-trace.zip)`,
    ].filter(Boolean);
    if (evidence.length) lines.push(`- **Evidence:** ${evidence.join(" · ")} — open a trace with \`npx playwright show-trace <file>\``);
    const near = (log?.evidence ?? []).filter((e) => e.at <= at + 3 && e.at >= at - 60);
    if (near.length) {
      lines.push("- **Browser problems in the minute before:**", "");
      for (const e of groupEvidence(near)) lines.push(`  - [${fmt(e.at)}] ${e.actor} ${e.kind}: ${e.message.split("\n")[0]}${e.url ? ` — ${shortUrl(e.url)}` : ""}${e.count > 1 ? ` (×${e.count})` : ""}`);
      lines.push("");
    }
    lines.push(excerpt.length
      ? `- **Server log** (errors from 30 s before the failure; full logs in \`logs/\`):\n\n  \`\`\`\n${excerpt.map((l) => `  ${l}`).join("\n")}\n  \`\`\``
      : "- **Server log:** no errors logged around the failure (full logs in `logs/`)");
    return lines.join("\n");
  });
  const warningLines = warnings.map((w, i) =>
    `- W-${String(i + 1).padStart(2, "0")} · ${w.stage} · ${w.actor} · **${w.kind}** · ${w.message.split("\n")[0]}${w.url ? ` — \`${shortUrl(w.url)}\`` : ""}${w.count > 1 ? ` (×${w.count})` : ""} — [video at ${fmt(w.at)}](chapters/${w.stage}.mp4)`);
  const counts = `${failedIds.length} failed, ${blockedIds.length} blocked, ${passedIds.length} passed, ${warnings.length} warnings`;
  writeFileSync(join(runDir, "BUGS.md"), `# Bugs — ${stamp.replace("_", " ")} · ${code} · ${counts}

Each bug links to the recording at the moment the check failed, the steps that led there, screenshots, Playwright
traces and server log lines. Failed recordings are kept in \`failures/\` and are never pruned.

${bugSections.length ? bugSections.join("\n\n") : "No failures."}

## Blocked
${blockedIds.length ? blockedIds.map((id) => `- ${status[id].title} — not run, blocked by ${status[id].blockedBy.join(", ")}`).join("\n") : "None."}

## Warnings (seen in the browser while chapters ran; the chapter may still have passed)
Console errors, uncaught page errors, server errors (5xx), failed requests, and requests to this app's servers
slower than 5 s.
Some may be expected (e.g. a chapter that deliberately breaks something); check the video.

${warningLines.length ? warningLines.join("\n") : "None."}
`);

  // ---------- run.json ----------
  const summary = { stamp, code, failed: failedIds.length, blocked: blockedIds.length, passed: passedIds.length, warnings: warnings.length, chapters: status };
  writeFileSync(join(runDir, "run.json"), JSON.stringify(summary, null, 2));
  return {
    summary, status,
    bugs: bugs.map((b) => ({ n: b.n, title: b.s.title, stage: b.s.stage, error: b.s.error?.split("\n")[0] ?? "", video: b.rel && b.video ? `${b.rel}/video.mp4 (at ${fmt(b.s.videoAt ?? 0)})` : null })),
  };
}

/** recordings/README.md: intro plus every run, newest first. */
export function writeIndex(recordingsDir) {
  const runs = readdirSync(recordingsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name)).map((d) => d.name).sort().reverse();
  const rows = runs.map((name) => {
    const r = readJson(join(recordingsDir, name, "run.json"), null);
    const result = !r ? "(older run, no summary)" : r.failed || r.blocked ? `❌ ${r.failed} failed, ${r.blocked} blocked, ${r.passed} passed — [BUGS.md](${name}/BUGS.md)` : `✅ ${r.passed} passed`;
    return `| [${name.replace("_", " ")}](${name}/README.md) | ${r?.code ?? ""} | ${result} | ${r ? r.warnings : ""} |`;
  });
  writeFileSync(join(recordingsDir, "README.md"), `# Recordings

Each folder is one run of \`pnpm record\`, named by date and time (\`YYYY-MM-DD_HHmm\`). Open the folder's
\`README.md\` for the chapter list, or play \`restaurant-os-walkthrough.mp4\` for everything in one video. If anything
failed, the folder's \`BUGS.md\` lists each failure with a link to the recording at that moment.

Left side: the admin (desktop). Right side: the customer storefront (phone). Both are recorded at the same
time against one running system, so admin changes can be watched arriving on the customer side.

How to make a new recording: see \`tests/recording/README.md\`.

## Runs

| Run | Code | Result | Warnings |
| --- | --- | --- | --- |
${rows.join("\n")}
`);
}

/** --keep <n>: deletes all but the newest n runs in which every chapter passed. Runs with failures, and runs without a summary, are never deleted. */
export function pruneRuns(recordingsDir, keep, current, currentPassed) {
  const passing = readdirSync(recordingsDir).filter((name) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(name) && name !== current)
    .filter((name) => { const r = readJson(join(recordingsDir, name, "run.json"), null); return r && !r.failed && !r.blocked; })
    .sort().reverse();
  const remove = passing.slice(Math.max(0, keep - (currentPassed ? 1 : 0)));
  for (const name of remove) rmSync(join(recordingsDir, name), { recursive: true, force: true });
  return remove;
}
