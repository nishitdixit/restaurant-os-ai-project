# Set up a one-command recorded E2E run with an automatic bug report

Paste this whole file into an AI coding agent at the root of any project. It tells the agent to analyse the
project and build a harness where **one command** starts the app in isolation, drives every important user
flow in a real browser while recording video, checks each flow, and writes a dated run folder containing:

- a video for every flow, plus one combined walkthrough video,
- a `BUGS.md` listing each failure and warning, linked to the recording (with the timestamp), screenshot,
  trace and server log lines that show it,
- server logs, Playwright traces and a `README.md` index for the run.

Recordings of failing flows are **never deleted**, so every bug has a video that reproduces it.

---

## Your role

You are setting up a recorded end-to-end test harness for this project. It replaces a large part of manual
testing: a person should be able to run one command after any change, then read `BUGS.md` and watch the linked
videos instead of clicking through the app.

Work in the phases below. **Stop at the end of Phase 2 and wait for my approval** before writing files. After
approval, work through to a full passing (or honestly failing) run without stopping, unless a decision comes
up that only I can make (paid services, credentials, changing app code, deleting data); in that case stop and
ask.

Do not commit, push or merge unless I ask.

---

## Phase 1 — Analyse the project (read only)

Find out, and write down briefly:

1. **What runs.** Every app and service (web front ends, API, workers, queues, cron jobs), how each one starts
   in dev and in production mode, its port, and how to tell it is ready (a health URL, a page that loads).
2. **What it depends on.** Database, cache, queues, object storage, email/SMS, payments, auth provider, maps,
   other third-party APIs. For each: can it run locally from an npm/pip package (e.g. `embedded-postgres`,
   `redis-memory-server`, `mongodb-memory-server`, SQLite file, MinIO), does the app already have a mock or test
   mode, or does it need a sandbox/test account (e.g. Clerk/Auth0/Firebase dev keys, Stripe test keys)?
3. **How data gets in.** Migrations, seed scripts, fixtures, admin sign-up.
4. **Who uses it.** The roles/actors (e.g. admin, staff, customer, guest) and which app each one uses, and on
   which device size (desktop or phone).
5. **The flows.** Build a flow inventory from routes/pages, navigation, API endpoints, specs/docs/tickets and
   existing tests. For each flow note the actor(s), the happy path, the important edge cases (validation errors,
   empty states, permission denied, limits, expiry/timeouts, retries, failure of a third-party), and whether
   one actor's action should become visible to another actor (live sync across windows).
6. **Time-based behaviour.** Anything that waits (expiry, reminders, schedules, caches). Look for config values
   that can shorten the wait for the run instead of really waiting.
7. **Existing test tooling.** Package manager, monorepo layout, existing Playwright/Cypress setup, CI.

## Phase 2 — Propose (then wait)

Send me a short proposal:

- The command (e.g. `npm run record`, `pnpm record`, `make record`) and its options (see Phase 3).
- How each dependency is provided in isolation, and any credentials or test accounts I must supply.
- Every environment value that differs from a normal run, and why. **No application code changes** in the
  harness itself; if a flow cannot be tested without one (missing test hook, a mock mode that doesn't exist),
  list it as a separate proposed app change.
- The ordered list of flows ("chapters"), one line each, with which actors appear in each, and which chapters
  depend on earlier ones.
- Rough run time.
- Whether recordings should be committed to git or gitignored (videos are large; ask me).

## Phase 3 — Build the harness

Use **Playwright** (`@playwright/test`) unless the project already uses something else that records video
and traces. Put everything in its own folder (e.g. `tests/recording/`) with its own package/dependencies, so
it doesn't affect the app. Use `ffmpeg-static` (or an equivalent package) for video work so nothing needs to be
installed system-wide.

### 3.1 The single command (runner script)

A Node script (e.g. `run.mjs`) that does everything, in this order:

1. Create the run folder `recordings/<YYYY-MM-DD_HHmm>/` with `raw/`, `flows/`, `failures/`, `logs/`,
   `traces/`.
2. Start every dependency fresh and isolated: a throwaway database (random port, temp dir) with all
   migrations run, an in-memory cache/queue, a temp media/upload dir, mock or sandbox modes for payments,
   email, SMS and other external services.
3. Build and start each app in **production mode** on **separate ports** from the dev servers, with a
   **separate build output directory** where the framework allows (e.g. Next.js `distDir` via env), so my dev
   servers, build and data are untouched. Clear any framework data cache from the previous run.
4. Capture every server process's stdout/stderr into `logs/<service>.log`. Keep reading the pipes the whole
   time (a full pipe blocks the server).
5. Wait until each service is ready (poll its health URL / a page), with a clear error naming the one that
   didn't start.
6. Run Playwright **as an async child process** (not `execSync`), so the runner can keep draining logs and
   serve the control channel (below) while tests run.
7. After the tests, whatever happened: compose videos, write `BUGS.md` and `README.md` (Phase 3.5), then
   stop every process and dependency and delete test users/data created in external sandboxes. Run cleanup
   in a `finally`, and also clean up leftovers from an interrupted earlier run at start-up (use a fixed prefix
   on every test user/email/record so they can be found).
8. Exit non-zero if any flow failed.
9. On macOS, keep the machine awake during the run (`caffeinate -i -w <pid>`). A sleeping machine freezes the
   browsers and every flow times out.

Options:

| Option | Does |
| --- | --- |
| *(none)* | Full run of every flow |
| `--flows 01,05` | Only these flows (plus the flows they depend on, run automatically) |
| `--skip-build` | Reuse the last recording build |
| `--serve` | Start the isolated stack and keep it running, no recording (for writing/debugging flows); print every URL and the DB connection string |
| `--headed` | Show the browsers |
| `--keep <n>` | Keep only the last *n* **fully passing** runs; runs with any failure are never auto-deleted |

**Control channel.** If a flow needs the environment to change mid-run (restart a worker in "provider down"
mode, restart the API, advance a clock), the runner serves a tiny local HTTP endpoint for it that the tests
call. Don't make tests kill processes themselves.

### 3.2 Recording one flow

A helper (e.g. `lib/stage.ts`) that opens a flow:

- One browser context **per actor**, each with `recordVideo` at a fixed size (e.g. admin desktop 1280×800,
  customer phone 430×800 using a Playwright device profile). Set locale, timezone and geolocation to fit the
  product.
- Login/session state carried from flow to flow by saving `storageState` files in the work dir, with a
  `fresh` option for a new person.
- Shared state between flows (created IDs, tokens) in a JSON file in the work dir.
- **Close and save videos in a `finally`**, so a flow that fails half way still produces its video. After
  closing, append `{id, title, summary, actors → video paths, status}` to `raw/manifest.json`.
- Trace: `retain-on-failure`; screenshot on failure; `retries: 0` (a retry would hide flaky bugs; flakiness is
  itself a finding).

**Make the videos watchable.** Inject an overlay with `context.addInitScript` (with `pointer-events: none`
everywhere so it never changes app behaviour): a visible cursor, a click ripple, a caption bar, and a full-
screen title card at the start of each flow. Wrap actions in helpers that move the cursor to the element
before clicking and type text visibly (`pressSequentially` with a small delay). Use a small `slowMo`. Hide
framework dev overlays if any appear.

**Steps with timestamps.** Provide `step(label, fn)`: it shows the label as a caption, records the time since
the video started (`page.video()` starts with the context, so note the context start time), and wraps the
body in `test.step`. When something fails, the bug report can say *"failed in step 'Apply coupon' at 1:42 of
the video"* and list the steps before it as reproduction steps.

**Collect evidence while the flow runs** (for every page of every actor):

- `console` messages of type error, `pageerror` (uncaught exceptions),
- responses with status ≥ 500, and 4xx responses from the app's own API that the flow didn't expect,
- `requestfailed` (except aborted prefetches/navigations),
- each with the timestamp in the video.

Save them per flow as JSON in the run folder.

**Multiple actors side by side.** When a flow has several actors, compose their videos side by side with
ffmpeg (`hstack`, scaled to one height) into `flows/<id>.mp4`, then concatenate every flow into one
walkthrough video. Single-actor flows are just converted to mp4.

### 3.3 Writing the flows

- One file per flow, numbered in run order (`flows/01-sign-up.spec.ts`, …). Each starts with a title card:
  number, title, one-sentence summary of what it proves.
- **Assert outcomes, not just actions**: after each important action, check what the user should see (the
  message, the new row, the updated total, the status on the *other* actor's screen). Use role/label
  selectors (`getByRole`, `getByLabel`) the way a user perceives the page; if a control can't be found by
  role or label, that is an accessibility finding — report it rather than falling back to CSS selectors
  silently.
- Cover edge cases and negative paths, not only happy paths: invalid input and that the error clears when
  fixed, permission denied for a lower role, empty states, limits, expired/timed-out states, a third-party
  failure and its retry, reload in the middle of a flow, back button.
- For cross-actor flows, show the change arriving on the other actor's screen; if it arrives via polling or
  a cache, refresh/wait with a timeout and caption how long it took.
- Shorten waits through configuration (e.g. a 5-minute expiry instead of 30). If a real wait is unavoidable,
  split the flow into parts so the wait isn't in the video.
- Keep flows as independent as possible. Where a flow depends on an earlier one, declare the dependency. **Do
  not stop the whole run at the first failure**: when a flow fails, skip only the flows that depend on it
  (mark them "blocked by NN" in the report) and keep running the rest, so one run finds as many bugs as
  possible.
- Never weaken or delete an assertion to make a run pass when the app is wrong. That is a bug to report.

### 3.4 Keeping failure recordings

- For every failed flow, copy its video(s), the failure screenshot and the trace into
  `failures/<flow-id>/` so the evidence is in one place.
- The `--keep` pruning only ever deletes runs where every flow passed. Never delete a run, video or trace
  that is linked from a `BUGS.md`.

### 3.5 Reports written at the end of every run

**`recordings/<run>/BUGS.md`** — generated from the Playwright JSON reporter output, the step timings and the
collected evidence:

```markdown
# Bugs — <run date> · <git sha (or "uncommitted changes")> · 3 failed, 1 blocked, 14 passed, 5 warnings

## BUG-01 · Checkout total ignores coupon after editing the cart   (flow 10 · failed)
- **Where:** step "Apply coupon after changing quantity" — [video at 1:42](failures/10-checkout/flow.mp4)
- **Expected:** total ₹450 after SAVE10   **Actual:** total ₹500
- **Error:** `expect(locator).toHaveText` … (first lines)
- **Steps to reproduce:** 1. … 2. … 3. … (from the steps recorded before the failure)
- **Evidence:** [screenshot](failures/10-checkout/failure.png) · [trace](failures/10-checkout/trace.zip)
  (`npx playwright show-trace <file>`) · console errors: 1 · API 5xx: `POST /cart/coupon` 500 at 1:40
- **Server log** (lines around the failure time from `logs/api.log`):
  ```
  …
  ```
- **Likely area:** <file or module, if the trace/log makes it clear; otherwise omit>

## Blocked
- 11-order-lifecycle — blocked by 10

## Warnings (flows passed, but something looked wrong)
- W-01 · flow 08 · uncaught TypeError on /menu at 0:37 — [video at 0:37](flows/08-browsing.mp4)
- W-02 · flow 05 · `GET /api/items` took 6.2 s
```

If nothing failed, write "No failures" and still list the warnings.

**`recordings/<run>/README.md`** — the run index: date, git sha, overall result, link to the walkthrough
video, and a table of flows with start time in the walkthrough, link, title, one-line summary, length and
✅ / ❌ / ⏭ blocked, with failed rows linking to their entry in `BUGS.md`.

**`recordings/README.md`** — a list of runs, newest first, with pass/fail counts and links, plus how to run.

Also print a short summary to the terminal at the end: counts, the path of `BUGS.md`, and each bug's
one-line title.

### 3.6 Docs and wiring

- Add the command to the root task runner (`package.json` script, Makefile, etc.).
- `tests/recording/README.md`: what it does, the command and options, requirements (only credentials I must
  provide), what is isolated and which env values differ, the flow table, and the dev loop for writing a flow
  (`--serve`, then run one spec against it; snapshot/restore the database between attempts so earlier flows
  needn't be re-run).
- Add the build output dirs and temp dirs to `.gitignore`; for `recordings/`, follow what I chose in Phase 2.
- Make the harness typecheck.

## Phase 4 — Run, triage, repeat

1. Run individual flows while writing them, then the **full command** end to end.
2. For every failure, open the screenshot/trace/video and decide:
   - **Harness problem** (wrong selector, missing wait for something the app legitimately does
     asynchronously, test data clash): fix the harness. Prefer waiting for a visible outcome over fixed
     sleeps.
   - **App bug** (the app does the wrong thing, crashes, shows an error, loses data, a control has no
     accessible name, a layout covers content): **do not fix the app and do not work around it in the
     test.** Leave the assertion failing so it shows up in `BUGS.md`. Also watch the passing videos for things
     that look wrong but weren't asserted (overlapping elements, unreadable text, a flash of an error) and add
     them to a findings list.
3. Repeat until every failure left in the run is a real app bug, and the full run has completed once from a
   clean state with the single command.
4. Write `tests/recording/PROGRESS.md`: status, harness fixes made, and the **app findings** (each with flow,
   video link and timestamp, what's wrong, and a suggested fix area).

Then report to me: the command, run time, the run folder, and the bug list (titles + links). Propose fixes for
the app bugs separately; don't apply them until I approve. When a bug is fixed, the flow's assertion stays, so
a regression fails the next run and shows up in its `BUGS.md` with a video.

---

## Rules that apply throughout

- The harness must not change app behaviour: configuration (env values) only, overlays drawn in the test
  browser only.
- Never touch my dev database, dev servers, real third-party accounts or production. Only test/sandbox keys
  (refuse to start if a live key is detected, e.g. Stripe `sk_live_`, Clerk `sk_live_`).
- Everything the run creates outside the run folder is cleaned up, even after a crash or Ctrl+C.
- Don't print or save secrets in logs, videos, READMEs or `BUGS.md`.
- If the project has no web UI (API or CLI only), still do everything above, but replace video with a
  per-flow transcript of requests/responses or terminal output (e.g. recorded with `asciinema` if available),
  linked from `BUGS.md` in the same way.
