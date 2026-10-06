# Technical Stack Baseline

## Frontend

- Next.js
- TypeScript
- React
- shared component system

## Backend

- NestJS or equivalent TypeScript modular framework
- REST/OpenAPI
- typed validation

## Data

- PostgreSQL
- Prisma or equivalent typed ORM/query layer
- Redis for caching/jobs
- S3-compatible object storage

## Infrastructure principles

Prefer managed services, automated backups, observability, simple deployment and reasonable regional latency.

## Package management

Use one workspace strategy for shared TypeScript types/utilities. Avoid copying models between apps.

## Future mobile

Flutter is an acceptable path for owner/kitchen/rider apps after the web workflows stabilize.

## Stack changes

Any major stack replacement requires an ADR explaining:

- problem;
- alternatives considered;
- migration impact;
- operational impact;
- why the current baseline is insufficient.
