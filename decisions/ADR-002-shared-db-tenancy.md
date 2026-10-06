# ADR-002: Shared Database, Shared Schema Tenancy

Status: Accepted

## Decision

Use a shared PostgreSQL schema with explicit tenant IDs for MVP/V1.

## Rationale

Simple operations, low infrastructure cost and good fit for early SaaS scale.

## Guardrails

Tenant isolation must be enforced in application/service/repository boundaries and covered by automated tests.

## Future

Evaluate RLS, schemas or databases only when supported by product or enterprise requirements.
