# System Architecture

## Architecture style

**Modular monolith** with clear domain/module boundaries, internal interfaces and asynchronous jobs.

Do not split into microservices until a concrete scaling, team or reliability boundary justifies it.

## Recommended stack

### Public web + admin

- Next.js
- TypeScript
- React
- server-rendered/streamed public pages where beneficial
- responsive design system

### Backend

- NestJS or equivalent TypeScript modular backend
- REST API for MVP
- OpenAPI-generated contracts or equivalent typed client generation

### Persistence

- PostgreSQL
- Prisma or equivalent typed ORM/query layer
- migrations committed to source control

### Async work

- Redis
- BullMQ or equivalent job system

### Object storage

- S3-compatible storage for images/assets

### Payments

- provider abstraction; initial Indian provider such as Razorpay if approved

### Messaging

- provider abstraction for WhatsApp/SMS/email

### Hosting

Choose boring managed infrastructure. Optimize for observability, backups and easy rollback rather than raw infrastructure control.

## High-level components

```text
Browser
  |
  +--> Storefront Web
  |
  +--> Admin Web
           |
           v
       API / BFF
           |
    Modular Application
    |  |  |  |  |  |
    Catalog Orders CRM Delivery Payments Analytics
           |
      PostgreSQL
           |
      Redis / Jobs
           |
  External providers
```

## Module boundaries

- Identity & Access
- Tenant & Configuration
- Catalog
- Availability
- Cart & Checkout
- Orders
- Payments
- Promotions
- Customers/CRM
- Delivery
- Notifications
- Analytics
- Integrations
- Platform Administration

## Request flow

Public customer request -> storefront server/client -> API -> domain service -> repository -> event/job where required.

Admin mutation -> authenticated API -> authorization -> domain service -> persistence -> audit/event.

External webhook -> verify signature -> idempotency check -> adapter -> domain service -> event.

## Synchronous vs asynchronous

Synchronous:

- catalog read;
- availability check;
- cart validation;
- order creation;
- payment initiation;
- admin CRUD.

Asynchronous:

- notification sending;
- analytics event processing;
- image processing;
- search indexing where introduced;
- report aggregation;
- retryable delivery-provider calls.

## Domain events

Publish internal events in a transactional-safe manner. Prefer an outbox pattern once asynchronous side effects become meaningful.

## Caching

Use caching primarily for public, low-volatility content. Never allow stale cache to authorize a purchase of a disabled product.

## Search

MVP should use database-backed product search. Introduce a dedicated search engine only when measured requirements justify it.

## Files/media

Store original uploads in object storage and serve optimized derivatives. Persist metadata, not binary blobs, in PostgreSQL.

## Observability

Every request should be traceable by request ID. Important business operations should emit structured logs and metrics.

## Configuration

Runtime environment configuration must be validated at startup. Secrets are environment/secret-manager concerns, never source-controlled configuration.

## Deployment

Mainline deployment pipeline:

`lint -> typecheck -> unit tests -> integration tests -> build -> migration check -> deploy -> smoke tests`

## Architecture guardrails

- No database access from UI components.
- No vendor-specific API models inside core domain types.
- No cross-module writes bypassing domain services.
- No duplicated monetary calculation logic.
- No tenant context inferred from arbitrary request body fields.
