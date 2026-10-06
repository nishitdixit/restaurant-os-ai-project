# ADR-004: Provider Adapter Boundaries

Status: Accepted

## Decision

Payments, messaging, delivery and marketplace integrations must be behind explicit provider interfaces/adapters.

## Rationale

Third-party providers can change APIs, availability, commercial terms or coverage. Core business logic should survive provider replacement.

## Rule

Provider DTOs do not cross into core domain modules.
