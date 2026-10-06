# Initial Backlog

Priority uses P0/P1/P2. P0 blocks pilot. P1 important for MVP/V1. P2 later.

## P0

- [x] Scaffold monorepo/application boundaries.
- [x] Configure PostgreSQL migrations.
- [x] Implement tenant + user + membership models.
- [x] Implement permission middleware/guards.
- [x] Create brand/outlet onboarding.
- [x] Create category/product CRUD.
- [x] Create modifier groups/modifiers.
- [x] Create product availability toggle.
- [x] Build public storefront shell.
- [x] Build category/product pages.
- [x] Build cart.
- [x] Build server-side cart validation.
- [x] Build delivery-zone eligibility.
- [x] Build checkout quote.
- [x] Integrate approved payment provider through PaymentService with Mock and Razorpay adapters.
- [x] Implement payment webhook idempotency with verified signatures, replay protection and amount validation.
- [x] Implement order creation idempotency.
- [x] Implement order state machine.
- [x] Build order admin board.
- [x] Build manual delivery dispatch.
- [x] Build transactional notifications (outbox + BullMQ; development provider per ADR-010).
- [x] Build customer records.
- [x] Build basic offers/coupons.
- [x] Build basic analytics dashboard.
- [x] Add sitemap/canonical/metadata/structured data.
- [x] Add audit logging for sensitive mutations.
- [x] Add critical path integration tests (API integration on real Postgres + Playwright E2E).
- [x] Pilot UAT checklist (`engineering/PILOT_UAT.md`; execution with the pilot pending).

## P1

- [x] Bulk catalog actions (bulk stock and publish/archive shipped with MVP catalog UX).
- [ ] Custom domain mapping.
- [ ] WhatsApp integration.
- [ ] Customer segmentation.
- [ ] Reorder flow.
- [ ] Kitchen display mode.
- [ ] Delivery provider adapter.
- [ ] Tenant billing.
- [ ] Platform admin.
- [ ] Richer analytics.

## P2

- [ ] Recipe/BOM inventory.
- [ ] procurement.
- [ ] multi-brand.
- [ ] multi-outlet.
- [ ] aggregator synchronization.
- [ ] automated delivery orchestration.
- [ ] loyalty.
- [ ] AI analyst.
- [ ] AI campaign assistant.
