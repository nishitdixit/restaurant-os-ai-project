# Tests

| Layer | Where | Runs with |
| --- | --- | --- |
| Domain unit tests (pricing, modifiers, promotions, order state machine, serviceability, phone identity, opening hours) | `packages/domain/src/*.test.ts` | `pnpm --filter @restaurant-os/domain test` |
| API integration tests (real Postgres, real migrations + seed, Fastify `inject`) — checkout, payments & webhooks, promotions under concurrency, tenant isolation, roles, order operations, catalog, onboarding, notifications/outbox, analytics reconciliation | `apps/api/test/*.test.ts` | `pnpm --filter @restaurant-os/api test` |
| Payment adapter contract tests (mock + Razorpay) | `apps/api/test/payment-providers.test.ts` | same |
| End-to-end customer journeys in a real browser (mobile + desktop) | `tests/e2e/specs` | `pnpm test:e2e` |
| Recorded walkthrough of every admin + storefront flow (videos, also asserts each flow) | `tests/recording/chapters` | `pnpm record` |

`pnpm test` runs the first three. Integration tests start a disposable PostgreSQL per file via
`embedded-postgres`; set `TEST_DATABASE_ADMIN_URL=postgresql://user:pass@host:5432/postgres` to use an
existing server instead (CI does this). Each test file creates and migrates its own database.

## End-to-end

E2E runs against a running stack seeded with the pilot data:

```sh
pnpm db:setup                      # against the DATABASE_URL in apps/api/.env
pnpm dev                           # or the production builds
E2E_DATABASE_URL=<same DATABASE_URL> pnpm test:e2e
```

The global setup opens the pilot outlet around the clock so the suite is time-of-day independent.

Specs:

- `customer.spec.ts` — browse, options, coupon, pay, failed payment and retry, idempotency, serviceability,
  minimum order, search/SEO, checkout errors, category chips.
- `themes.spec.ts` — every complete preset (theme + homepage composition, applied as a draft and opened in signed
  merchant preview): header/footer/hero variants and section order match the preset, no sideways scroll at 360, 390
  and 430 px and desktop, computed contrast of header, section headings, dishes, add buttons, category chips and
  the order button; reduced motion shows every section immediately.
- `a11y.spec.ts` — axe (WCAG 2.x A/AA) on home, menu, dish, checkout and delivery areas with a light and a dark
  preset; serious/critical violations fail.

Merchant preview links are signed: the specs mint tokens with `PREVIEW_SECRET` (`E2E_PREVIEW_SECRET` overrides),
so set the same value the API under test uses (the development default needs nothing).
Admin screens require a Clerk session, so admin workflows are covered at the API layer
(`apps/api/test/operations.test.ts`, `catalog.test.ts`, `tenancy.test.ts`) rather than in the browser.
