# Cart & Checkout Spec

## Goal

Convert cart intent into a validated order.

## Rules

- server recalculates totals;
- unavailable items fail validation;
- delivery address is checked against service area;
- promotions are recalculated;
- idempotency key is required for order submission.

## Failure states

- item unavailable;
- price changed;
- promotion invalid;
- address not serviceable;
- payment initiation failed.

## Acceptance

Refreshing or double-clicking place order does not create duplicate commercial orders.
