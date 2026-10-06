# Testing Strategy

## Pyramid

### Unit tests

Domain rules, pricing, promotions, state machines, serviceability and authorization decisions.

### Integration tests

Database repositories, transactions, payment webhook handling, tenant isolation and event processing.

### Contract tests

Provider adapter request/response mapping and webhook fixtures.

### E2E tests

Critical customer flows:

- browse -> cart -> checkout -> payment -> order;
- unavailable item rejection;
- invalid delivery address;
- coupon redemption;
- payment failure/retry.

Critical admin flows:

- create product;
- toggle availability;
- accept/prepare/ready/dispatched;
- create offer.

## Tenant isolation tests

Create tenant A and B fixtures. Every major repository/service query should prove that A cannot read or mutate B.

## Idempotency tests

Replay:

- order submission;
- payment callback;
- provider webhook;
- notification event.

Expected: no duplicate side effects.

## Regression policy

Any production bug gets a regression test before or with the fix when practical.
