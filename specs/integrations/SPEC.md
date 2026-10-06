# Integrations Spec

## Goal

Connect external providers without coupling core product logic to them.

## Requirements

- provider config per tenant;
- capability discovery;
- secret handling;
- adapter interface;
- provider error normalization;
- webhook verification;
- integration health status.

## Acceptance

A disabled/failing provider does not corrupt internal order state and manual fallback remains possible where the workflow supports it.
