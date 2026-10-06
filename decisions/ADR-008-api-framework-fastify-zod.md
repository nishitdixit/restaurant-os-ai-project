# ADR-008: API Framework — Fastify + Zod

Status: Accepted
Date: 2026-10-06

## Context

The API began as a single `node:http` handler with hand-parsed bodies (`any`), no validation, no CORS,
and unlogged 500s. `docs/TECH_STACK.md` asks for "NestJS or equivalent" with typed validation and
OpenAPI. The existing raw-SQL repositories are correct and well tested.

## Decision

Use Fastify 5 with `fastify-type-provider-zod`:

- request schemas are Zod objects shared with the web apps (`packages/types`), so the same rules
  validate forms in the browser and requests on the server;
- the OpenAPI document is generated from those schemas (`/openapi.json`, UI at `/docs`);
- one module per domain under `apps/api/src/modules/*`, each registering its own routes;
- authorization runs in `preValidation`, so unauthorized callers never see validation details;
- data access stays raw SQL via `pg` (parameterised, explicit enum casts) — the "equivalent typed
  query layer" — rather than introducing an ORM mid-project.

## Alternatives considered

- NestJS: the documented first choice, but a decorator/DI rewrite of every handler for no product gain.
- Keep `node:http`: validation, OpenAPI and modularity would all be hand-built.

## Consequences

Request validation, error envelopes, rate limiting (`@fastify/rate-limit`), CORS and security
headers (`@fastify/helmet`) are framework features. The API is bundled with `tsup` for production.
