# Build State

Updated: 2026-10-08

## Current phase

Phase 1 — Pilot MVP: **feature-complete, pending pilot acceptance (UAT)**.

Payments and customer messaging run on development providers by product decision (ADR-010).

## MVP exit criteria (roadmap/MVP.md)

| Criterion | Status | Evidence |
| --- | --- | --- |
| Paid test order succeeds | ✅ (mock provider) | E2E `browse, customise, apply a coupon, pay…`; Razorpay sandbox still to run |
| Duplicate submission can't duplicate an order | ✅ | `checkout.test.ts` (5 concurrent same-key requests), E2E double-click |
| Payment webhook retries are safe | ✅ | `checkout.test.ts` webhook signature/replay/amount test |
| Tenant isolation tests pass | ✅ | `tenancy.test.ts` (tenant A/B read + write, cross-tenant references) |
| Merchant edits products without a developer | ✅ | Admin Menu screens; `catalog.test.ts` |
| Unavailable product can't be purchased | ✅ | `catalog.test.ts`, E2E out-of-stock |
| Delivery area is enforced | ✅ | pincode + radius zones, minimum order; `checkout.test.ts`, E2E |
| Customer receives confirmation | ✅ (recorded, not sent) | outbox → BullMQ → development provider; admin Messages; `operations.test.ts` |
| Admin can track status | ✅ | Order board, order detail timeline; `operations.test.ts` |
| Analytics reconcile with orders | ✅ | `operations.test.ts` reconciliation test |
| Metadata / sitemap / structured data | ✅ | SSR pages, JSON-LD, dynamic sitemap; E2E SEO test |
| Critical flows have automated tests | ✅ | 11 domain + 61 API integration/contract + 14 E2E (7 flows × mobile/desktop) |
| Rollback procedure documented | ✅ | `engineering/RUNBOOK.md` |

## Verified in this environment (2026-10-06)

- `pnpm typecheck` clean across all 7 packages.
- `pnpm test`: 72/72 (domain 11, API 61) on a real PostgreSQL 18 with migrations 0001–0007 and the seed.
- `pnpm build`: API bundle, storefront and admin production builds succeed; the bundled API serves from a `pnpm deploy --prod` directory.
- E2E: 14/14 in Chromium (Pixel 7 + desktop) against API + storefront + seeded database.
- Worker against real Redis 7: outbox drained, flaky sends retried and delivered, no duplicates.
- Visual check of storefront home, menu, checkout and order pages at mobile and desktop sizes.

## Not yet verified (needs the owner's accounts/infrastructure)

- Admin UI with a real Clerk session (admin screens compile and build; their API calls are covered by integration tests).
- Migrations + seed against the Supabase project (`pnpm db:setup` with the Supabase URL).
- Docker image builds and the GitHub Actions workflows (Docker is not installed locally).
- Razorpay sandbox order/verify/webhook (adapter is contract-tested; ADR-007/010).
- Real WhatsApp/SMS/email delivery (provider not selected; ADR-010).

## What changed in the MVP completion

- API rebuilt on Fastify + Zod with OpenAPI, modules per domain, CORS, rate limits, security headers, structured logs with request ids (ADR-008).
- Fixed: payment confirmation and webhook SQL type errors; mock provider state lost on restart; availability toggles that could never turn an item back on; coupon caps never enforced; delivery zone/minimum ignored; unpaid orders counted as sales.
- Migration 0007 (additive): merchant profile, media, catalog attributes, order numbers/tokens/timestamps/notes, delivery tracking, promotion rules/redemptions, notification delivery, transactional outbox.
- Worker (BullMQ): outbox relay, notifications with retries, payment-window expiry (ADR-009).
- Storefront: SSR home, menu, category, product, search, offers, delivery areas, contact, checkout, test-mode payment, live order status, reorder; JSON-LD, sitemap, robots, share card.
- Admin: onboarding, setup checklist + publish, order board with sound alerts, order detail (dispatch, delivery updates, cancel + refund, partial refunds, notes), menu (items, categories, option groups, bulk stock/publish, photos), offers, delivery areas, customers, analytics, messages, settings (business, brand, kitchen & hours, team & roles, audit log).
- Shared design system in `packages/ui`; shared contracts in `packages/types`; domain rules in `packages/domain`.

## Storefront themes (2026-10-06, ADR-012 — V1 "theme editor" pulled forward)

- Admin **Appearance** page: 12 researched one-click styles + Classic (`ui/THEME_PRESETS.md`), a Customise panel
  for every token (12 colours, 17 fonts, size, weights, case, five radii, borders, shadows, spacing, light/dark,
  six component variants), a live preview of the real storefront (phone/desktop, any page), autosaved drafts,
  publish, discard and one-click restore from history.
- Per-tenant storage (migration 0008: `brands.theme`, `theme_draft`, `brand_theme_versions`); publishing is blocked
  with `THEME_NOT_READABLE` while WCAG AA text contrast fails, with one-click fixes.
- Design tokens are runtime CSS variables with defaults equal to the original look (admin unchanged); the
  storefront renders the theme server-side; dish cards support list / photo grid / compact layouts.
- Tests: domain (`theme.test.ts`: contrast maths, every preset readable and distinct, injection-safe
  normalisation), API (`appearance.test.ts`: draft/publish/restore, guardrail, validation, permissions, tenant
  isolation), E2E (`themes.spec.ts`: every preset on phone and desktop — no sideways scroll, computed contrast of
  header, dish, add-button, category and checkout button text), recording chapter 06b.

## Storefront brand experience (2026-10-07, ADR-013 — owner directive "Brand Experience Upgrade" + preset expansion)

- **Homepage builder**: the homepage is the restaurant's own list of 12 restaurant-native sections (hero in 7
  layouts, highlights, categories, featured, bestsellers, combos, story, gallery, offers, reviews, delivery, call to
  action), each with controlled variants, backgrounds (tones), English/Hindi text and photos. Appearance → Homepage
  adds, hides, reorders and edits them; the live preview re-renders and scrolls to the section being edited.
- **Complete presets**: each of the 13 styles now sets look + homepage composition + header/footer/width + menu
  presentation + badge treatment + motion; "Use this style" applies all of it, keeping the restaurant's content
  ("Look only" keeps the layout). Rationale per preset in `ui/THEME_PRESETS.md`; every pair of presets differs on
  ≥ 6 visible dimensions (domain test).
- **Media library** with alt text and usage; category photos; up to 8 extra photos per dish; Hindi dish/category
  names; dish badges (incl. custom labels); **Bestseller computed from paid orders** (never set by hand).
- **Storefront UX**: one-row phone header with a menu sheet, food above the fold, "More ways to order" sheet,
  inline menu search with suggestions/recent searches, veg-only filter, photo/menu-board view toggle, quantity
  stepper on dish cards, cart drawer with thumbnails, remove, real delivery-fee preview, offer hints and
  free-delivery progress, sticky "Place order" on phones, dish photo gallery, policy pages, FSSAI/GSTIN footer,
  CSS-only motion (none/subtle/expressive, reduced-motion respected), SEO title/description/share image.
- **Free delivery above an amount** per delivery area (BUSINESS_RULES P16, pending sign-off).
- **Signed merchant preview links** replace the open `?preview=1` (`PREVIEW_SECRET`).
- Migration 0009 (additive). Restaurants that never edit get the default composition (the original homepage).
- Tests: domain 62 (experience schema, presets distinctness, badges, bestsellers, free delivery, tone contrast),
  API 78 (incl. `experience.test.ts`: draft/publish/restore together, signed preview, alt-text guardrail, media
  library, cross-tenant references, bestsellers, badges/gallery/Hindi, reserved slugs, free delivery, FSSAI and
  policies), E2E: `themes.spec.ts` 13 presets × phone/desktop + reduced motion, `a11y.spec.ts` (axe), and
  `customer.spec.ts` — all passing against a local stack on 2026-10-07. Accessibility fixes found by axe: faint
  text contrast, dimmed out-of-stock cards. Recorded walkthrough `recordings/2026-10-07_0330` (chapters 01–06, 06b
  Appearance builder, 08 customer browsing; real Clerk dev sign-up): 8/8 passed. Other chapters were not re-run.

## Orders from WhatsApp, phone and walk-ins; staff-only offers; WhatsApp messages (2026-10-08, ADR-014)

- **New order** (Orders → New order, `order.create`: Owner, Manager, Kitchen, Staff): staff enter WhatsApp, phone,
  walk-in and other orders. Same pricing engine as website checkout (shared `createOrderRecord`): same total for the
  same cart, delivery outside the delivery areas blocked, unavailable dishes blocked. Orders start accepted, record
  who entered them, and are paid by cash / UPI / card or **pay later** ("Payment due" on the board, "Mark as paid",
  never expired, not in sales until paid). Known phone numbers fill name and saved addresses. Source badges and a
  source filter on the order list; customer updates optional per order.
- **Staff-only offers**: "Who can use it" on every offer (shown on website / code only / staff only). Staff pick any
  live offer on the new-order screen; staff-only codes are refused on the website as unknown codes. Usage split by
  website vs staff and by staff member on the Offers page; offers table and "pay later" money due in Analytics.
- **"Order on WhatsApp"**: buttons on the dish page, the option sheet, the cart and checkout; the restaurant's
  existing WhatsApp links (header sheet, homepage buttons, footer) also carry the cart. The message lists quantity,
  dish, portion and add-ons with prices and the total (checkout adds the quoted fee/offer/total and delivery
  details). Appearance → Page layout switch "Order on WhatsApp buttons" (default on; needs a WhatsApp number).
- Migration 0010 (additive): `orders.created_by_user_id/payment_method/notify_customer`, `promotions.staff_only`,
  `promotion_redemptions.applied_by_user_id`, permission `order.create`. BUSINESS_RULES P17–P20 await sign-off.
- Tests (2026-10-08): domain 69 (incl. `order-message.test.ts`), API 94 (incl. `staff-orders.test.ts`: price
  parity with the website, all four roles, double submit, blocked delivery/unavailable dish, paused ordering, walk-in
  rules, customer lookup, staff-only offers hidden/refused/attributed, pay later never expires and counts once paid,
  mark-paid rules, manual refunds, notify setting, tenant isolation), E2E 62/62 against a local stack (incl.
  `whatsapp.spec.ts` on phone and desktop). Admin production build passes. Recording chapter 18 added (storefront WhatsApp
  messages, staff-only offer, WhatsApp pay-later order + mark paid, walk-in cash order, reports) and chapter 07
  updated for the new offer control: `recordings/2026-10-08_0132` 01–07 passed; `recordings/2026-10-08_0144`
  01–06 + 18 passed (7/7). Open: one React hydration warning (#418) on the storefront `/menu` in chapter 18's
  recording, not reproducible on a local production build.

## Security review findings (2026-10-06 alignment review)

- **Fixed:** the V1-preview endpoints (kitchen tickets, inventory, segments, referrals, reorder, custom domains,
  campaigns, entitlements) are no longer registered. They accepted ids without tenant checks (cross-tenant
  read of order status/totals via kitchen tickets; cross-tenant inventory ledger writes), allowed owners to grant
  their own entitlements, and verified custom domains without DNS proof. The code remains in
  `apps/api/src/commerce/` for later phases, marked NOT EXPOSED; a regression test asserts the routes return 404.
- **Fixed:** storefront host -> brand resolution through unverified custom domains is removed; each deployment
  serves its configured brand slug.
- **Changed:** self-service restaurant creation defaults to off (`SELF_SIGNUP_ENABLED=false`, Gate 4).

## Decisions awaiting human sign-off

- `docs/BUSINESS_RULES.md` → "Implemented rule details — PENDING OWNER SIGN-OFF" (P1–P15): GST/tax-inclusive
  pricing, promotion semantics, payment window, refund default, notification wording, invite linking.
- ADR-011 order lifecycle representation (accepted as implemented; parameters pending the sign-off above).

## Next

1. Run `engineering/PILOT_UAT.md` with the pilot restaurant.
2. Run migrations against Supabase; deploy images (runbook).
3. Choose and connect a messaging provider; run Razorpay sandbox; then disable the mock providers.
