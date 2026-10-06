# Security Model

## Threat areas

- cross-tenant data leakage;
- unauthorized admin mutations;
- payment webhook spoofing;
- order enumeration;
- coupon abuse;
- bot traffic;
- credential theft;
- insecure file uploads;
- secret leakage;
- excessive admin permissions;
- PII exposure in logs.

## Authentication

Choose a managed/authenticated session approach appropriate to the deployment. Do not roll custom password cryptography.

## Authorization

Permission checks occur server-side. Role names are convenience; effective authorization is permission-based.

Suggested permissions:

- tenant.read
- tenant.manage
- catalog.read
- catalog.manage
- availability.manage
- order.read
- order.manage
- customer.read
- customer.manage
- promotion.manage
- delivery.manage
- analytics.read
- integration.manage
- billing.manage
- audit.read

## Tenant isolation

Tenant ID must be resolved from authenticated context or verified public store mapping. Request payloads cannot override effective tenant context.

## Public endpoints

Rate-limit:

- login/auth abuse;
- checkout submissions;
- coupon validation;
- order lookup;
- contact forms.

Avoid exposing sequential IDs that enable easy enumeration.

## Payments

Never trust browser claims for payment success. Trust only verified provider callbacks / server-side verification according to provider contract.

## Webhooks

Verify signatures, replay protection and event idempotency.

## File uploads

Validate MIME/type/size, process asynchronously where useful, store outside app server filesystem, generate safe filenames and transformations.

## Logging

Do not log full payment credentials, access tokens, secrets, or unnecessary customer PII.

## Admin audit

Audit:

- price changes;
- product availability changes;
- refund/cancellation actions;
- role/permission changes;
- integration credentials/configuration changes;
- promotion creation/changes;
- major tenant configuration changes.

## Security review gates

No release containing payment, auth, tenant isolation or webhook changes can be merged without explicit review/testing of those boundaries.
