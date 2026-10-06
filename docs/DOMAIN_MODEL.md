# Domain Model

## Core bounded concepts

### Tenant
A commercial organization using the platform.

### Brand
Customer-facing identity owned by a tenant. A tenant may eventually have multiple brands.

### Outlet
Physical operating location associated with a brand. MVP assumes one primary outlet but the data model should permit more later.

### User
Authenticated platform user. A user may belong to one or more tenant memberships.

### Role / Permission
Authorization concepts for tenant operations.

### Catalog
The sellable menu structure.

### Category
Grouping of products for presentation and navigation.

### Product
A sellable item definition with content, price and availability policy.

### ModifierGroup / Modifier
Optional selections attached to a product.

### Price
A monetary value in a currency. Do not use floating point for money.

### Availability
Current sellability state and any future scheduling/override state.

### Customer
First-party customer identity attached to a tenant.

### Address
Customer delivery address with normalized fields and location metadata where available.

### Cart
Ephemeral customer intent to order.

### Order
A submitted commercial transaction. Contains immutable-at-purchase line-item snapshots.

### Payment
Financial attempt/state associated with an order.

### Promotion
A rule-defined benefit that can affect order pricing.

### DeliveryZone
Business-defined serviceability rule.

### DeliveryOrder
Fulfillment request associated with an order.

### Notification
Outbound communication event and delivery attempt.

### AuditEvent
Immutable administrative or security-relevant activity record.

### AnalyticsEvent
Business/behavior event used for product analytics.

## Important separation

`Product` is catalog definition.

`OrderItem` is an immutable purchased snapshot.

Changing a product price later MUST NOT rewrite historical order economics.

`Availability` is not equivalent to `Product.active`. A product can remain published but temporarily unavailable.

`Payment.status` is not equivalent to `Order.status`.

`DeliveryOrder.status` is not equivalent to `Order.status`.

## Event-oriented thinking

Useful domain events:

- ProductPublished
- ProductAvailabilityChanged
- CartValidated
- OrderCreated
- PaymentAuthorized
- PaymentCaptured
- PaymentFailed
- OrderAccepted
- OrderPreparing
- OrderReady
- DeliveryRequested
- DeliveryAssigned
- OrderDispatched
- OrderDelivered
- OrderCancelled
- RefundIssued
- CustomerCreated
- PromotionRedeemed

## Invariants

- An order belongs to exactly one tenant.
- An order belongs to one outlet for MVP.
- Every order line references a product snapshot, not only current product data.
- An order cannot move to a later status without satisfying required prior state.
- Payment callbacks are idempotent.
- Customer data is tenant-scoped.
- Admin actions require permission.

## MVP implementation additions (2026-10-06)

Supporting concepts introduced while completing the MVP. None duplicates an existing concept; each is
owned by the module named.

| Concept | Purpose | Owner module / table |
| --- | --- | --- |
| OrderNote | Internal staff note on an order (not visible to the customer) | Orders / `order_notes` |
| Order number | Human-friendly per-tenant sequence shown to customers and staff | Orders / `orders.order_number`, `tenant_order_counters` |
| Public order token | Unguessable reference for the customer's order-status page | Orders / `orders.public_token` |
| DeliveryStatusEvent | History of a DeliveryOrder's status changes | Delivery / `delivery_status_events` |
| MediaAsset | Metadata for uploaded images held in object storage | Catalog / `media_assets` |
| DomainEvent (outbox) | Transactional record of a domain event awaiting async processing (ADR-009) | Platform / `domain_events` |
| PromotionRedemption | One promotion use by one order (existing table, now written and released) | Promotions / `promotion_redemptions` |

Domain events emitted today and how they map to the event list above:

| Emitted | Covers |
| --- | --- |
| `OrderCreated` | OrderCreated |
| `PaymentCaptured`, `PaymentFailed` | PaymentCaptured, PaymentFailed |
| `OrderStatusChanged` (payload `from`, `to`) | OrderAccepted, OrderPreparing, OrderReady, OrderDispatched, OrderDelivered |
| `OrderCancelled` | OrderCancelled (payload says whether a refund is starting) |
| `DeliveryUpdated` | DeliveryAssigned (reassignment), delivery failure |
| `PaymentCapturedAfterCancellation` | Payment arriving after the payment window closed (ADR-011) |

ProductPublished, ProductAvailabilityChanged, RefundIssued, PromotionRedeemed and CustomerCreated are
recorded as audit events / table rows today; they become outbox events when an async consumer needs them.
