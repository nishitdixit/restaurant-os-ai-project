# ADR-007: Initial Payment Provider — Razorpay

Status: Accepted
Date: 2026-10-05

## Decision

Razorpay is the initial production payment provider for Restaurant OS.

The core application remains provider-neutral through `PaymentService` and `PaymentProvider`.

Development and automated tests use `MockPaymentProvider`; live Razorpay credentials are not required for MVP development or MVP payment acceptance.

## Security requirements

- Client redirects/callbacks never directly mark an order paid.
- Razorpay payment signatures are verified server-side.
- Verified payment status and amount are fetched/validated server-side before capture is recorded.
- Razorpay webhooks are HMAC-verified and replay-safe.
- Provider secrets are environment/secret-manager configuration only.
- Provider-specific DTOs do not cross into the order domain.

Razorpay's security guidance recommends server-side payment status/amount checks and HMAC webhook validation.

## Consequences

The MVP can be completed and tested with the deterministic mock provider. Live Razorpay sandbox testing remains production validation debt until external credentials/network access are available.
