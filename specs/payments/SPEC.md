# Payments Spec

## Goal

Collect online payment and reconcile status safely.

## Requirements

- create provider payment intent/order;
- persist internal payment attempt;
- handle success/failure;
- verify webhook;
- idempotently apply event;
- expose customer-safe result.

## Acceptance

Repeated webhook events do not duplicate payments or order transitions.
