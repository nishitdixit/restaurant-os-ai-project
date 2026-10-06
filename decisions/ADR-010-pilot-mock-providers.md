# ADR-010: Mocked Payments and Notifications for the Pilot MVP

Status: Accepted
Date: 2026-10-06

## Decision

For MVP completion the product owner chose to keep payments and messaging mocked:

- Payments use `MockPaymentProvider`, which is stateless (HMAC-derived ids and signed outcomes) so it
  behaves identically across restarts and instances. The storefront shows a clearly labelled test-mode
  checkout; the chosen outcome is signed and verified server-side exactly like a provider callback.
  `RazorpayPaymentProvider` remains implemented and contract-tested (ADR-007).
- Notifications use `DevelopmentNotificationProvider`: messages are fully rendered, queued, retried and
  recorded, and shown in the admin "Messages" screen, but nothing leaves the system.

## Guardrails

- The API refuses `PAYMENT_PROVIDER=mock` in production unless `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true`
  and a unique `MOCK_PAYMENT_SECRET` are set — a supervised pilot without real money only.
- Switching to real providers changes configuration and adapters only; order, payment and notification
  domain code is unchanged.

## Consequences

MVP exit criterion "real paid test order succeeds" is met with the mock provider; a Razorpay sandbox
run and a messaging provider remain production-launch tasks.
