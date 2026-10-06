# ADR-001: Modular Monolith

Status: Accepted

## Context

The product has many domains but will begin with a small team and a single pilot. Operational complexity of microservices would be premature.

## Decision

Use a modular monolith with explicit module boundaries, internal interfaces and asynchronous jobs.

## Consequences

Positive:
- faster development;
- simpler deployment;
- easier local development;
- easier transactional consistency.

Negative:
- requires discipline to prevent module coupling;
- one deployable unit can become large.

## Review trigger

Revisit only when scale, reliability, team ownership or deployment independence creates a concrete need.
