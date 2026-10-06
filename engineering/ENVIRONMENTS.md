# Environments and Configuration

## Environments

### Local

Fast feedback; local DB/Redis or disposable containers.

### Preview/Staging

Production-like providers where safe; seeded test tenant; sandbox payment integrations.

### Production

Real customer data, payments and delivery workflows.

## Configuration rules

- validate environment variables at startup;
- keep examples in `.env.example` without secrets;
- use secret manager/host secrets in deployed environments;
- distinguish public and server-only variables;
- never expose provider secret keys to browser code.

## Seed data

Seeds must be deterministic and must clearly identify demo/test tenants. Production seed commands must be disabled or guarded.
