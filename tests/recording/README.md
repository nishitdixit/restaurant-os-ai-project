# Recorded walkthrough (`pnpm record`)

Records the admin and the storefront working together, flow by flow, and saves the videos in
`recordings/<YYYY-MM-DD_HHmm>/`. Run it after any development to get a fresh, dated recording; each chapter
also asserts its flow, so a broken flow fails the run instead of recording a wrong screen.

```sh
pnpm record                         # everything (~35–45 min, includes a real 6.5-min payment-expiry wait)
pnpm record --chapters 01,02,03     # only some chapters (they build on each other: start at 01)
pnpm record --skip-build            # reuse the last recording build of the web apps
pnpm record --serve                 # start the isolated stack and keep it running (for writing chapters)
```

## Requirements
- `apps/admin/.env.local` with Clerk **development** keys (`pk_test_…`, `sk_test_…`). The run creates
  throwaway Clerk users (`ros-rec-…+clerk_test@example.com`, test phone numbers, code 424242) and deletes
  them at the end (and any leftovers at the start of the next run).
- Nothing else: PostgreSQL (embedded), Redis (in-memory) and ffmpeg are provided by npm packages.

## Isolation — the apps are not changed
- Fresh database with all migrations, separate ports (API 4100, storefront 3100, admin 3101) and a separate
  Next.js build directory (`.next-recording`), so your dev servers and data are untouched.
- Differences from a normal run are configuration only: `SELF_SIGNUP_ENABLED=true` (to film onboarding),
  `PAYMENT_WINDOW_MINUTES=5` (to film expiry), and the worker restarted in failure mode for chapter 16.
- The cursor, click ripples, captions and title cards are drawn by the test browser on top of the page.

## Chapters
| # | Chapter |
| --- | --- |
| 01 | Owner sign-up and onboarding |
| 02 | Business details, brand and theme |
| 03 | Kitchen, ordering options and hours |
| 04 | Delivery areas |
| 05 | Building the menu |
| 06 | Publishing the storefront |
| 07 | Offers and coupon codes |
| 08 | A customer browsing |
| 09 | Live changes from the admin to the storefront |
| 10 | Checkout edge cases |
| 11 | From new order to delivered |
| 12 | Cancellations, refunds, notes and reordering |
| 13 | Team and roles |
| 14 | Analytics, customers, messages and audit log |
| 15 | Unpaid orders expire (two parts, wait cut) |
| 16 | When a message can't be delivered |
| 17 | Taking the storefront offline and back |

## Regression checks
The recordings show the apps as they are. Issues the recording surfaced earlier (listed in `PROGRESS.md`,
"App findings") are fixed, and the chapters now assert the fixed behaviour — e.g. no account error after
sign-in, kitchen staff land on the order board, checkout errors clear when corrected, the menu's category bar
stays below the header — so a regression fails the run and is visible in that chapter's video and trace.

## Tips
- On macOS the run keeps the machine awake with `caffeinate`; closing the lid on battery still sleeps it,
  which freezes the browsers and times chapters out.
