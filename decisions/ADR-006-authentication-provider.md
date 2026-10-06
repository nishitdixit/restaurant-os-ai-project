# ADR-006: Clerk Authentication Provider

Status: Accepted

## Context

Restaurant OS requires managed authentication/session management. Application identity, tenant membership, roles, and permissions remain owned by PostgreSQL. Custom password hashing/authentication is prohibited.

## Decision

Use Clerk for authentication and session management. The API verifies Clerk-issued bearer tokens server-side and maps the Clerk `sub` claim to `users.clerk_user_id`. PostgreSQL remains the source of truth for application users, tenant memberships, roles, permissions, and authorization.

The authorization chain is:

`Clerk session -> verified Clerk identity -> application user -> active tenant membership -> database role/permissions -> business operation`

Clerk organization/role data is not used as the Restaurant OS authorization source.

## Security requirements

- Clerk secret keys are server-only.
- Publishable Clerk configuration may be used by browser-facing Clerk components.
- No custom password hashing or authentication is implemented.
- Every protected API operation requires a verified Clerk identity.
- Application users must be active in PostgreSQL.
- Tenant membership must be active and match the authenticated application user.
- Permissions are evaluated server-side from PostgreSQL-backed role membership.
- Deactivated users/memberships fail closed.
- Tokens and credentials are never logged.

## Consequences

Clerk owns authentication/session mechanics while Restaurant OS owns business identity and authorization. A Clerk user without a provisioned application user cannot access tenant operations.
