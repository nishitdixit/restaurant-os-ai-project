# Payment Implementation

## Provider boundary

Production business logic uses `PaymentService` and the `PaymentProvider` interface. Razorpay-specific DTOs, signatures and HTTP calls stay inside `RazorpayPaymentProvider`.

```text
Cart
  -> Checkout/order creation
  -> PaymentService
  -> PaymentProvider
     -> MockPaymentProvider (development/tests)
     -> RazorpayPaymentProvider (production)
  -> server-side verification/webhook
  -> PaymentService
  -> payment/order state
```

## Configuration

Development defaults to:

```text
PAYMENT_PROVIDER=mock
MOCK_PAYMENT_OUTCOME=success
```

Production uses:

```text
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Credentials are environment/secret configuration only.

## Lifecycle

Application payment states are:

`CREATED -> PENDING -> AUTHORIZED -> CAPTURED`

with terminal/error paths:

`FAILED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`.

A payment is never marked captured from a browser redirect alone. Verification or a verified provider webhook is authoritative.

## Idempotency and replay safety

- Payment intent creation is keyed by tenant/order/idempotency key.
- Provider request idempotency is passed to Razorpay through `X-Razorpay-Request-Id`.
- Webhook events are unique on `(provider, provider_event_id)`.
- Duplicate webhook deliveries produce no second side effect.
- Captured/authorized webhook amounts must equal the server-created payment amount.
- Refunds are independently idempotent and stored as financial records.

## Mock provider

`MockPaymentProvider` exercises the same interface as Razorpay and supports:

- success
- failure
- cancellation
- pending/authorization
- retry after failure
- deterministic idempotent intents
- signature verification
- timeout simulation
- partial/full refunds

It is not a development shortcut that directly mutates orders.

## Runtime validation debt

Live Razorpay sandbox verification remains pending until network access and credentials are available. This is production validation debt, not an MVP dependency. The Pilot MVP can complete payment acceptance using the deterministic mock provider and its full state machine.
