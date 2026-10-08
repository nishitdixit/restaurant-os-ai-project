# ADR-014: Staff-entered orders, staff-only offers and "Order on WhatsApp" messages

Status: Accepted (implemented)
Date: 2026-10-08
Relates to: ORDER_LIFECYCLE.md "Order channel", POS_STRATEGY.md (channel-neutral orders), ADR-011, ADR-013

## Context

Restaurants still receive many orders outside the website: on WhatsApp, by phone and at the counter. Those orders
were invisible to the platform, so the order board, kitchen flow, customer history, offer usage and reports covered
only part of the business, and staff priced them by hand, which drifted from the website. Customers who tapped
"Order on WhatsApp" also sent a bare greeting, so the restaurant had to ask what they wanted.

The docs already treat channel as metadata on one order model (DIRECT_WEB, WHATSAPP, PHONE, POS…) and require
orders to stay channel-neutral; analytics already labelled WhatsApp and Phone.

## Decision

### 1. Staff enter orders through the same pricing engine

- `POST /v1/admin/orders` creates an order from the dashboard. Website checkout and staff entry share one function
  (`createOrderRecord` in `checkout/service.ts`); only the **origin** differs. Prices, option rules, availability,
  delivery areas, minimum order, delivery fee, free-delivery threshold, offers and coupon limits are identical, so the
  same cart costs the same either way (tested).
- **Sources:** `WHATSAPP`, `PHONE`, `WALK_IN`, `OTHER` (stored in `orders.channel`). Aggregator orders
  (Swiggy/Zomato) are **not** entered by hand: their prices and payouts differ from the menu.
- **Who:** new permission `order.create` for Owner, Manager, Kitchen and Staff (and platform admins).
- **Status:** staff orders start **ACCEPTED** (staff took them), skip the new-order alarm, then follow the normal
  lifecycle. Order numbers continue the website's sequence. Website "paused" and "closed" switches don't block staff
  orders; delivery areas, unavailable dishes and delivery/pickup being switched off still do.
- **Delivery outside the delivery areas is blocked**, as on the website (owner decision).
- **Customer:** a phone number is required except for an anonymous walk-in (or "other") pickup; delivery also needs a
  name. Known numbers fill the name and saved addresses (exact phone lookup only, so roles without customer access
  can't browse customers). A blank name keeps the stored one.
- **Payment:** `CASH`, `UPI`, `CARD` (collected now → payment captured) or `PAY_LATER` (collect on delivery/pickup).
  Staff payments are recorded as provider `manual`. Pay-later orders appear on the board with "Payment due", are not
  in sales until **Mark as paid** (`POST /v1/admin/orders/:id/mark-paid`), are never cancelled by the payment-window
  job, and are summed separately in analytics (`paymentDue`). Refunds of manual payments are recorded without a
  provider call (the restaurant returns the money).
- **Customer updates:** optional per order (`notifyCustomer`); when on, the customer gets a confirmation stating
  whether payment was received or is due.
- **Safety:** an `Idempotency-Key` (namespaced `staff:`) makes double submits create one order; the creator is stored
  (`orders.created_by_user_id`), shown on the order and written to the audit log (`OrderEnteredByStaff`,
  `OrderMarkedPaid`).

### 2. Staff-only offers

- Offers gain **"Who can use it"**: `PUBLIC` (listed on the website), `CODE_ONLY` (works when typed, not listed —
  the old "hidden"), `STAFF_ONLY` (new). Stored as `promotions.is_public` + `promotions.staff_only`.
- Only Owner/Manager create and edit offers (`promotion.manage`, unchanged). Any staff member entering an order can
  **pick any live offer from a list**, including staff-only ones; there is no free-form manual discount.
- On the website a staff-only code behaves exactly like an unknown code ("X is not a valid code.") and is never
  listed, so it cannot leak.
- Usage is attributed: `promotion_redemptions.applied_by_user_id` (NULL = the customer at checkout). The Offers page
  shows website vs staff uses and who applied it; orders show the code, a "Staff only" tag and who applied it;
  analytics lists offer uses, discount and order totals per offer, split by source.

### 3. "Order on WhatsApp" messages carry the selection

- `whatsappOrderMessage` (`packages/domain/src/order-message.ts`, unit-tested) builds the prefilled text:
  numbered lines with quantity, name and line price, then options grouped by option group with price changes
  ("Portion: Full (+₹80)", "Add-ons: …"), then the items total. From checkout it adds the server-quoted offer,
  delivery fee and total, delivery/pickup, address, name, phone and note.
- **From a dish** (dish page, option sheet): that dish with the chosen quantity and options and a link to it; missing
  required options are asked for first. **From anywhere else** (cart, checkout, header sheet, homepage buttons,
  footer): the whole cart, or the plain greeting when the cart is empty.
- The cart now stores each option's group and price change (`CartItem.options`); carts saved earlier fall back to the
  plain option names. Very large carts are shortened to fit a wa.me link ("…and N more items"), keeping the total.
- New buttons appear only when the restaurant has a WhatsApp number **and** the Appearance switch "Order on WhatsApp
  buttons" (`experience.site.whatsappOrdering`, default on) is on. Applying a style preset keeps the setting.
- WhatsApp messages do not create orders; staff enter them with the new-order screen.

## Consequences

- One order model, one price engine and one report for every direct channel; the kitchen sees every order on the
  same board.
- `orders.payment_method`, `orders.created_by_user_id`, `orders.notify_customer`, `promotions.staff_only`,
  `promotion_redemptions.applied_by_user_id` and the `order.create` permission are added by migration 0010
  (additive). Existing orders are website orders; existing offers keep their visibility.
- Sales still count paid orders only; "pay later" money appears in sales when it is marked paid.
- Business rules P17–P20 (BUSINESS_RULES.md) record the choices above for owner sign-off.
