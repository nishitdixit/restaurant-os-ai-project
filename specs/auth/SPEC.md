# Auth & Authorization Spec

## Goal

Provide secure login and tenant-scoped role-based authorization.

## Acceptance criteria

- user can authenticate;
- tenant membership resolves correctly;
- unauthorized roles cannot perform protected mutations;
- deactivated membership cannot access tenant operations;
- authorization is server-side.

## Tests

Cross-tenant access, deactivated member, missing permission, valid permission.
