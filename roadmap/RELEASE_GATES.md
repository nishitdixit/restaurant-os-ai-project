# Release Gates

## Gate 0 — Engineering baseline

No known critical tenant/auth/security defect. CI and deployment work.

## Gate 1 — Internal demo

Happy-path storefront/order/admin workflow works with deterministic test data.

## Gate 2 — Pilot readiness

Real payment sandbox/controlled payment flow, notifications, tenant isolation, order idempotency and operational recovery tested.

## Gate 3 — Pilot production

Merchant can operate without developer for ordinary catalog/order updates. Monitoring and rollback exist.

## Gate 4 — Multi-tenant commercialization

Self-service onboarding, billing/entitlements, platform support and strong tenant isolation are verified.

## Gate 5 — Automation

Any automated delivery/CRM/AI action has auditability, failure handling and merchant controls.
