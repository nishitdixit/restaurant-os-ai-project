# Order Lifecycle

## State model

Recommended states:

`PENDING_PAYMENT`

`PAID`

`ACCEPTED`

`PREPARING`

`READY`

`PACKED`

`DISPATCHED`

`DELIVERED`

Terminal/exception states:

`CANCELLED`

`REFUND_PENDING`

`REFUNDED`

The exact implementation may combine some states if operationally simpler, but the semantic distinctions must remain clear.

## Transition rules

Only valid transitions are allowed. Every transition stores actor, timestamp and optional reason.

## Order channel

Channel is metadata describing origin, not a separate order model:

- DIRECT_WEB
- WHATSAPP
- PHONE
- SWIGGY
- ZOMATO
- ONDC
- POS

Only channels actually integrated/supported should create orders automatically in the platform.

## Snapshot policy

At order creation, snapshot:

- product name;
- base price;
- selected modifiers and prices;
- discounts;
- fees;
- taxes where applicable;
- customer and delivery address needed for fulfillment.

## Cancellation

Cancellation must record:

- who initiated it;
- when;
- reason code;
- free-text note if needed;
- refund consequence.

## Implemented MVP model (ADR-011)

| Lifecycle doc state | Implementation |
| --- | --- |
| `PENDING_PAYMENT` | `status = NEW`, `payment_status` ∈ {`PENDING`, `FAILED`, `CANCELLED`, …} — shown as "Awaiting payment" |
| `PAID` | `status = NEW`, `payment_status = CAPTURED` — the board's "New" column, waiting for acceptance |
| `ACCEPTED` … `DELIVERED` | `order_status` enum, validated by `packages/domain/src/orders.ts` |
| `CANCELLED` | `status = CANCELLED` with `cancel_reason_code`, `cancel_note`, `cancelled_by`, `cancelled_at` |
| `REFUND_PENDING` / `REFUNDED` | payment side: `payment_status` `PARTIALLY_REFUNDED`/`REFUNDED` + `payment_refunds` rows |

Rules:

- Payment capture never accepts an order; acceptance requires a captured payment.
- Unpaid orders are cancelled automatically after the payment window (`PAYMENT_WINDOW_MINUTES`, default 30) with reason `PAYMENT_NOT_COMPLETED`.
- Delivery orders: `READY → PACKED (optional) → DISPATCHED → DELIVERED`. Pickup orders: `READY → PACKED (optional) → DELIVERED`.
- Cancelling after preparation started requires OWNER or MANAGER.
- Every transition writes `order_status_events` (from, to, actor, reason code, note, time) and an audit event, and sets the first-time timestamp column (`accepted_at`, `ready_at`, `dispatched_at`, `completed_at`, `cancelled_at`).
- Delivery progress is tracked separately on `delivery_orders` (`ASSIGNED → PICKED_UP → DELIVERED`, or `FAILED` then reassigned) with `delivery_status_events`.

Cancellation reason codes: `CUSTOMER_REQUEST`, `ITEM_UNAVAILABLE`, `KITCHEN_CLOSED`, `ADDRESS_ISSUE`, `DELIVERY_FAILED`, `PAYMENT_NOT_COMPLETED` (system), `DUPLICATE_ORDER`, `OTHER` (note required).
