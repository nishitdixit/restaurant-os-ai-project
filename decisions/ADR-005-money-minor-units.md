# ADR-005: Money in Integer Minor Units

Status: Accepted

## Decision

Persist monetary values as integers representing the smallest currency unit plus explicit currency code.

## Rationale

Avoid floating-point precision errors and preserve deterministic financial calculations.

## Consequence

UI/API conversion logic must be explicit and centralized.
