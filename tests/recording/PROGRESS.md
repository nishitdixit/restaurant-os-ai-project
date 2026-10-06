# Recording harness — status and findings

Goal: `pnpm record` produces `recordings/<YYYY-MM-DD_HHmm>/` with side-by-side admin + storefront videos of
every flow, re-runnable after any development. Recordings are committed (not gitignored).

## Status (2026-10-06)
- All 17 chapters (15 in two parts) pass in one full run: `recordings/2026-10-06_1753/` (23:16 walkthrough).
- `pnpm record` wired at the root; docs in `tests/recording/README.md` and `recordings/README.md`.
- Harness fixes from full runs: Playwright runs async so the control channel (worker restarts) and server log
  pipes keep working; `caffeinate` keeps macOS awake (a sleeping Mac freezes the browsers and times out chapters).

## Dev loop (for changing chapters)
`node run.mjs --serve` keeps the stack up; export the RECORD_* variables shown in run.mjs `testEnv`
(DB URL is printed in the log) and run `npx playwright test chapters/NN`. Snapshot/restore the database between
attempts so earlier chapters needn't be re-run (chapters build on each other).

## App findings from recording — all fixed 2026-10-06
Chapters now assert the fixed behaviour (a regression fails the run) instead of captioning "Known issue".
1. Admin session race after Clerk sign-in/up (401 → "We couldn't load your account") — session query waits for a
   signed-in Clerk user, is keyed by user id and retries 401s with backoff (`apps/admin/lib/session.tsx`).
   Checked by `expectAccountLoaded` in `lib/auth.ts`.
2. Preview silently exited by the prefetch of "Exit preview" — middleware ignores prefetch requests and the link
   has `prefetch={false}`. The recording's prefetch-abort workaround was removed.
3. Clerk sign-in/sign-up card not centred — centred.
4. Unnamed switches (opening-hours days, stock, offer, option, header ordering toggle) — `Switch` takes `ariaLabel`.
5. Clerk Organizations were required — set to optional in the Clerk dashboard; the app keeps its own tenancy
   (ADR-006). `completeClerkTasks` still handles the task screen if it appears.
6. Store settings take up to ~30 s (menu ~15 s) to reach the storefront — by design (cache), stated in captions.
7. API/worker crash when PostgreSQL drops an idle connection — pool 'error' listener (and Redis error listeners);
   covered by `apps/api/test/resilience.test.ts`.
8. Menu scroll pulled back up by the chip bar — only the chip row scrolls horizontally now. The bar also never stuck
   (it was wrapped in a div, and on phones sat under the 105 px two-row header); it now sticks below the header and
   the active chip is measured from the bar's position (ch08 asserts it; E2E test).
9. Phone toasts covered the header — toasts are offset below the 64 px header.
10. Checkout field errors persisted after correction — each clears as soon as it is fixed (ch10 asserts; E2E test).
11. Kitchen/Staff landed on Home with a permission error — roles without Home go to the order board (ch13 asserts).
