# Coding Standards

## General

- Prefer simple explicit code over clever abstractions.
- Name domain concepts consistently with `DOMAIN_MODEL.md`.
- Keep functions focused.
- Validate inputs at system boundaries.
- Keep business rules in domain/application services, not UI components.

## TypeScript

- strict mode;
- no implicit any;
- avoid `any` except explicitly justified boundary adapters;
- use discriminated unions for state machines;
- use typed DTOs and validation schemas;
- use explicit error codes for domain errors.

## Database

- migrations are versioned and committed;
- monetary fields use integer minor units;
- foreign keys and indexes are intentional;
- never bypass tenant predicates;
- avoid N+1 queries.

## API

- consistent response/error shape;
- OpenAPI maintained;
- idempotency on retry-sensitive writes;
- pagination on lists.

## Frontend

- no direct DB access;
- reusable components;
- loading/error/empty/success states;
- optimistic UI only where rollback is safe;
- accessible forms and controls.

## Tests

Every meaningful domain rule should have deterministic tests.

## Dependencies

Before adding a library, assess whether existing project primitives already solve the problem. Keep dependency count intentional.
