# Release and Deployment

## Environments

- local;
- preview/staging;
- production.

## Release process

1. tests pass;
2. build passes;
3. migration reviewed;
4. preview/staging smoke test;
5. deploy;
6. post-deploy smoke tests;
7. monitor critical metrics.

## Migration rules

Prefer backwards-compatible migrations:

- add new nullable column;
- deploy code using it;
- backfill;
- enforce constraints later.

Avoid deploys requiring the old and new code to be incompatible simultaneously.

## Rollback

Document rollback for every risky release, including migration implications.

## Pilot releases

Early releases may be manually supervised. Production automation can increase as confidence grows.
