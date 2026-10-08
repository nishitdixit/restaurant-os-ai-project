# Business Rules

## Pricing and money

- Money is stored as integer minor units plus ISO currency code.
- Never use binary floating point for monetary calculations.
- Store subtotal, discounts, fees, taxes where applicable, and total as separate components.
- Order totals are snapshots of the checkout calculation.
- Refunds do not mutate original order totals; they create refund records/state.

## Catalog

- Product must belong to a tenant and category where category is required by the current menu structure.
- Archived products cannot be newly added to a cart.
- Inactive products must not appear in the customer storefront.
- Temporarily unavailable products may remain visible with a non-purchasable state.

## Cart

- Cart contents are revalidated against current product status, availability, price and promotion eligibility before order creation.
- Client-provided totals are never trusted.
- Coupon eligibility is evaluated server-side.

## Orders

- Order creation is idempotent using a client/order submission idempotency key.
- Order status changes are validated against a state machine.
- Cancellation rules depend on order status and role.
- Historical line-item names, quantities, prices and modifier prices must remain stable.

## Payments

- Payment provider callbacks can be delivered multiple times.
- The same provider event must not create duplicate payment effects.
- An order should be considered paid only when the configured payment policy says payment is captured/confirmed.

## Availability

- Availability must be checked at cart validation and again at order creation.
- Admin availability updates should take effect without cache inconsistency causing orders for disabled items.
- Automatic inventory-driven availability is deferred beyond MVP.

## Delivery

- Serviceability is evaluated before payment when possible.
- Delivery fees must be explained before payment.
- A delivery job cannot be marked delivered without an eligible preceding state.

## Promotions

- Promotions cannot make totals negative.
- Usage limits are enforced atomically.
- Expired or paused promotions are not redeemable.
- Promotion rules are tenant-scoped.

## Tenant isolation

- Every request resolves authenticated tenant context or public store tenant context.
- Cross-tenant reads/writes are prohibited by design, not merely UI.
- Background jobs retain tenant context.

## Notifications

- Notification sending is asynchronous where practical.
- Retryable failures are retried with limits.
- Repeated provider callbacks/events should not spam customers.

## Analytics

- Analytics failures must not block order creation.
- Revenue metrics use a documented source of truth and reconciliation logic.

## Storefront themes

- A restaurant's look is per tenant: one published theme and at most one draft on its brand (ADR-012).
- Customers only ever see the published theme; drafts are visible only in the merchant preview.
- A theme cannot be published (or restored) while any text would fail WCAG 2.2 AA contrast (4.5:1) — main and
  secondary text, button text, accent text and header text.
- Only roles with `tenant.manage` (Owner) can change the look; roles with `tenant.read` can view it.
- Every published theme is kept and can be restored in one step.

## Storefront brand experience (ADR-013)

- The homepage, site layout, menu presentation and SEO overrides are per tenant (`brands.experience`), drafted
  and published **together with the theme** as one version; a restore brings back both.
- A homepage photo can't be published without a description (alt text). Text placed on a photo always gets a
  readable overlay; section backgrounds (page, soft, brand, contrast) are readable by construction.
- Homepage content may only reference the restaurant's own photos, dishes and categories (others are dropped).
- **Bestseller** is never set by hand: a dish needs at least N paid, uncancelled orders in the last D days and is
  ranked by units sold, top K only (restaurant setting, default 5 orders / 30 days / 6 dishes). No sales → no
  Bestseller badge and no Bestsellers section.
- Merchant badges: at most three per dish (New, Signature, Chef's choice, Recommended, Limited, Combo, or a custom
  label up to 24 characters). There is no dish-level "Offer" badge — offers are order-level codes.
- Trust content is never fabricated: an order count is shown only from real paid orders and only from 50 upward;
  a rating is shown only with its source, a checkable https link and the month it was read; reviews show their
  source and date and are never labelled "verified".
- Preset default copy is neutral and makes no claims about the restaurant (food, history, hours).
- Applying a preset's layout keeps the restaurant's content and never deletes a section (unused ones are hidden).
- Merchant preview of drafts and unpublished stores requires a signed, expiring link issued to signed-in staff.
- FSSAI licence number (14 digits) and GSTIN, when entered, appear in the storefront footer; policy pages appear
  only once the restaurant has written them.
- Category web addresses can't use names of store pages (`menu`, `offers`, `checkout`, `policies`, …).

## Implemented rule details — PENDING OWNER SIGN-OFF

These decisions affect money, customers or operations. They were made during MVP implementation without
explicit product approval (AI_WORKFLOW.md: money/domain ambiguity must be surfaced). They are implemented
as described; each needs a yes/no from the product owner before the pilot goes live. Where a rule is
configurable, the setting is named.

| # | Area | Implemented rule | Where | Decision needed |
| --- | --- | --- | --- | --- |
| P1 | Tax | No tax is calculated: `tax_minor` is always 0 and menu prices are entered and shown **tax-inclusive** (admin hint "Including taxes"). No GST breakdown on orders. | `checkout/pricing.ts`, product form | Is tax-inclusive pricing with no GST line acceptable for the pilot? Who issues GST invoices? |
| P2 | Promotions | Discount applies to the **item total only** — never to the delivery fee. Minimum order is checked against the item total before discount. | `domain/promotions.ts` | Confirm. |
| P3 | Promotions | Percentage discounts round **down** to the paisa; "maximum discount" caps them. | `computeDiscount` | Confirm rounding. |
| P4 | Promotions | One use is **reserved when the order is placed** (before payment) and **released** if the order is cancelled or expires unpaid. A usage cap can therefore be briefly held by unpaid orders (max `PAYMENT_WINDOW_MINUTES`). | `checkout/service.ts`, `payments/service.ts` | Count at placement (current) or only at payment? |
| P5 | Promotions | "First order only" = the customer (matched by mobile number) has **no earlier paid, not-cancelled order**. Fully refunded orders don't count as prior orders. | `pricing.ts customerHistory` | Confirm definition. |
| P6 | Promotions | "Once per customer" is keyed by **mobile number** (customer record), not email or device. | `pricing.ts` | Confirm. |
| P7 | Customers | Customer identity is the **normalized mobile number** (+91…). Email is optional and is attached only if no other customer of the restaurant already uses it. | `domain/identity.ts`, `checkout/service.ts` | Confirm. |
| P8 | Delivery | When several delivery areas match, the **cheapest fee** wins (then the fastest ETA). Radius areas match only when the customer shares their location. | `domain/delivery.ts` | Confirm. |
| P9 | Payments | Unpaid orders are cancelled after **30 minutes** (`PAYMENT_WINDOW_MINUTES`). | ADR-011, worker | Is 30 minutes right? |
| P10 | Payments | Cancelling a **paid** order **refunds the full amount by default** (merchant can untick). Partial refunds: owner/manager only. | `orders/admin.ts`, admin UI | Confirm default and roles. |
| P11 | Orders | Payment capture does **not** accept the order; the kitchen accepts it. Kitchen/staff may cancel only before preparation starts; afterwards owner/manager. | ADR-011, `domain/orders.ts` | Confirm. |
| P12 | Ordering hours | Orders are refused while the outlet is closed or paused — **no pre-orders** for later. | `pricing.ts` | Confirm no scheduled orders in MVP. |
| P13 | Notifications | Customer updates are sent for: order confirmed (on payment), payment failed, accepted, ready, dispatched, delivered/collected, cancelled (+ refund note). Merchant in-app alerts: new paid order, failed delivery, payment after cancellation. Wording is in `apps/api/src/jobs/notifications.ts`. | ADR-009/010 | Approve the message set and wording (automated customer messaging gate). |
| P14 | Marketing consent | The "send me offers" checkbox is **unticked by default**; consent is stored with a timestamp and can be withdrawn by staff on request. | checkout, customers | Confirm. |
| P15 | Access | Invited team members are linked **on first sign-in by verified email**. Self-service restaurant creation is **off** (`SELF_SIGNUP_ENABLED=false`). | `auth/context.ts`, env | Confirm (auth/security gate). |
| P16 | Delivery | **Free delivery above an amount** (per delivery area, optional): the fee is waived when the **item total before discount** reaches the threshold — the same base as the minimum order (P2). | `domain/delivery.ts deliveryFeeFor`, `pricing.ts` | Before or after discount? |
| P17 | Staff orders | Orders staff enter (WhatsApp, phone, walk-in, other) use the **website's prices, options, delivery areas, fees and offers**; delivery outside the areas is blocked. They start **accepted**. The website's "paused"/"closed" switches don't block them. Swiggy/Zomato orders are not entered by hand. | ADR-014, `orders/staff.ts` | Confirm. |
| P18 | Staff orders | "Pay later" orders are **not counted in sales** until staff mark them paid (cash/UPI/card), and never expire. Cancelling a cash/UPI/card order records the refund as returned by the restaurant. | ADR-014 | Confirm. |
| P19 | Offers | **Staff-only offers**: created by Owner/Manager only; any staff member can apply them to orders they enter; never shown or accepted on the website. No free-form manual discount. | ADR-014, `pricing.ts` | Confirm. |
| P20 | Notifications | Staff-entered orders send the customer a confirmation (payment received / to pay on delivery) and the usual status updates, unless staff switch updates off for that order. No new-order alarm for them. | `jobs/notifications.ts` | Approve wording. |
