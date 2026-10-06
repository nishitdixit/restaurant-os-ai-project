# Observability Implementation

Phase 0 establishes structured JSON request logs with timestamp, level, service, request ID, event, path, method and duration. Tenant/user identifiers are accepted by the logger context but must only be added when safely available.

Secrets, access tokens, authorization headers and passwords are explicitly removed from log context.

Future domain modules should emit business events and metrics described in `docs/OBSERVABILITY.md` without duplicating sensitive customer/payment data.
