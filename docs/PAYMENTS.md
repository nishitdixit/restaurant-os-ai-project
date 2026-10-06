# Payments

## Goals

Support secure online payment for direct orders while keeping the order domain provider-neutral.

## Lifecycle

`INITIATED -> REQUIRES_ACTION -> AUTHORIZED/CAPTURED -> FAILED/EXPIRED`

Exact states depend on provider capabilities.

## Rules

- payment amount is calculated server-side;
- order and payment records are linked by internal IDs;
- provider IDs stored separately;
- webhooks are verified and idempotent;
- failed payment may leave a pending cart/order intent according to policy;
- customer never gets “paid” status based solely on browser redirect.

## Refunds

Refund creates a distinct financial record/state rather than rewriting the original payment.

## Reconciliation

Future reports should reconcile internal captured amounts against provider settlements. This is not an MVP accounting module but the data model must preserve provider references.
