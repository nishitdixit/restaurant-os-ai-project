# ADR-011: Order Lifecycle Representation and Payment Window

Status: Accepted (implemented) — business parameters pending owner sign-off (see BUSINESS_RULES.md "Pending sign-off")
Date: 2026-10-06

## Context

`docs/ORDER_LIFECYCLE.md` recommends `PENDING_PAYMENT` and `PAID` states before `ACCEPTED`, and allows
combining states "if operationally simpler" as long as the semantic distinctions stay clear. The domain
model also requires `Payment.status` to be separate from `Order.status`. The earlier implementation moved an
order straight to `ACCEPTED` when payment was captured, so the kitchen never explicitly accepted it.

## Decision

1. **Pending payment and paid are expressed by `orders.payment_status`, with `orders.status = NEW`.**
   - `NEW` + payment not captured = *pending payment* (admin: "Awaiting payment").
   - `NEW` + `CAPTURED` = *paid, awaiting acceptance* (admin board "New" column).
   No `PENDING_PAYMENT`/`PAID` enum values are added; the existing `order_status` enum is unchanged.
2. **Capture never accepts an order.** A merchant accepts it (`NEW → ACCEPTED`), and acceptance is refused
   while payment is not captured (`PAYMENT_NOT_CAPTURED`). This preserves "Accepted" as a kitchen
   commitment (capacity, stock) rather than a payment side effect.
3. **Payment window.** An order unpaid after `PAYMENT_WINDOW_MINUTES` (default 30) is cancelled by the
   worker with reason `PAYMENT_NOT_COMPLETED`; pending payment attempts are cancelled and promotion usage is
   released. A capture that arrives after that cancellation keeps the order cancelled, records an audit event
   and alerts the merchant to refund (`PaymentCapturedAfterCancellation`).
4. **Fulfilment-specific transitions.** Delivery: `READY → (PACKED) → DISPATCHED → DELIVERED`; dispatch is a
   separate operation that records the rider. Pickup: `READY → (PACKED) → DELIVERED` ("collected"). `CANCELLED`
   is reachable from any non-terminal state; after `ACCEPTED` only OWNER/MANAGER may cancel.
5. **Cancellation of a paid order refunds by default** (merchant can untick it). The refund runs after the
   cancellation commits; a provider failure leaves the refundable amount visible and retryable.
6. **Order identifiers.** Customers see a per-tenant sequential `order_number` (from 1001); public status pages
   are addressed by an unguessable `public_token`, never by number or UUID (docs/SECURITY.md enumeration).

## Consequences

- `REFUND_PENDING`/`REFUNDED` from the lifecycle doc are represented on the payment side
  (`payment_status` = `PARTIALLY_REFUNDED`/`REFUNDED`, refunds in `payment_refunds`), not as order states.
- Analytics count an order as sales only when paid and not cancelled (docs/ANALYTICS.md).
- The 30-minute window, refund default and acceptance policy are business parameters; changing them is a
  configuration/rule change, not a schema change.
