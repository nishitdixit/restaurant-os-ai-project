# Multi-Tenancy Model

## Strategy

Use a shared PostgreSQL database with shared schema and explicit `tenant_id` on tenant-owned tables for MVP/V1.

This is the simplest architecture that supports SaaS economics while retaining a clear path to stronger isolation if scale or enterprise requirements later justify it.

## Tenant hierarchy

`Tenant -> Brand -> Outlet`

MVP normally creates one brand and one outlet per tenant but the schema must not assume that forever.

## Tenant context

Every authenticated admin request resolves:

- user identity;
- tenant membership;
- role;
- effective permissions.

Public storefront requests resolve tenant from:

- domain mapping;
- configured slug/subdomain;
- future custom domain mapping.

## Isolation requirements

Application repositories/services must require tenant context for tenant-owned operations.

Do not rely on frontend route parameters as authorization.

Background jobs must include tenant identity explicitly.

Logs and metrics should include tenant identifiers where safe and useful.

## Shared reference data

Some data may be platform-global:

- currency metadata;
- country/state reference data;
- provider catalogs;
- feature definitions.

Global data must never be interpreted as tenant-owned data.

## Future isolation options

If enterprise needs evolve, consider:

- PostgreSQL row-level security;
- separate schemas;
- separate databases;

but do not introduce these before a demonstrated requirement.

## Tenant deletion

Implement soft-deletion/deactivation and an explicit data-retention policy. Hard deletion is an asynchronous administrative workflow and should require elevated permission.
