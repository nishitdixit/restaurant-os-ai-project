# Analytics Model

## Principle

Analytics must answer business questions, not merely produce charts.

## Event taxonomy

### Acquisition

- storefront_viewed
- menu_viewed
- product_viewed
- source_attributed

### Commerce

- product_added
- product_removed
- cart_viewed
- checkout_started
- checkout_failed
- order_created
- payment_started
- payment_succeeded
- payment_failed

### Fulfillment

- order_accepted
- order_preparing
- order_ready
- delivery_requested
- order_dispatched
- order_delivered
- order_cancelled

### Retention

- customer_created
- coupon_applied
- coupon_redeemed
- customer_reordered

## Core metrics

### Revenue

- gross sales;
- discounts;
- fees;
- refunds;
- net sales;
- contribution margin where cost inputs exist.

### Conversion

- storefront -> product;
- product -> cart;
- cart -> checkout;
- checkout -> paid.

### Retention

- first-to-second order conversion;
- repeat rate;
- order frequency;
- days since last order.

### Operations

- acceptance time;
- preparation duration;
- delivery duration;
- cancellation rate;
- stock-out frequency.

## Source of truth

Financial reports derive from order/payment records and reconciled transaction states, not raw analytics events.

Behavior analytics may be eventually consistent and must not be used for financial accounting.

## Attribution

Store first/last-known attribution metadata when available and privacy-appropriate:

- source;
- medium;
- campaign;
- referrer;
- landing page.

## AI-ready analytics

Metrics should be stored in a way that can later support questions such as:

- “Why did sales drop?”
- “Which products drive repeat orders?”
- “Which campaigns have positive contribution margin?”

## Implemented MVP metric definitions (source of truth)

The owner dashboard (`GET /v1/admin/analytics`) computes every figure from `orders`, `order_items`
and `payment_refunds`; behavioural events are not used for money. Periods are whole local days in the
outlet timezone; orders are dated by placement time.

| Metric | Definition |
| --- | --- |
| Paid orders | Orders with payment captured (incl. partly/fully refunded later) and not cancelled |
| Gross sales | Σ order total (items − discount + delivery fee) of paid orders |
| Discounts / fees | Σ discount / delivery fee of paid orders |
| Refunds | Σ refunds issued in the period, on any order |
| Net sales | Gross sales − refunds |
| Average order value | Gross sales ÷ paid orders |
| Completed / cancelled | Paid orders delivered or collected / orders cancelled in the period (incl. expired unpaid) |
| New / repeat customers | Customers whose first paid order is in the period / customers with an earlier paid order |
| Channel mix | Paid orders grouped by `orders.channel` (direct web orders are `DIRECT_WEB`) |

The integration suite asserts that dashboard totals equal direct sums over the order table.
