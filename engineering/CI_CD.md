# CI/CD Baseline

## Pull request pipeline

1. formatting/lint;
2. typecheck;
3. unit tests;
4. integration tests;
5. build;
6. dependency/security checks where configured;
7. preview deployment for UI changes.

## Main branch

Main must remain deployable.

## Production pipeline

- build immutable artifact;
- verify migration plan;
- deploy;
- run smoke tests;
- monitor errors/orders/payments;
- rollback when predefined failure thresholds are exceeded.
