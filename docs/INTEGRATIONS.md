# Integration Architecture

## Principles

External providers are dependencies, not domain models.

Use adapter interfaces and map provider DTOs to internal models at the boundary.

## Integration categories

### Payments

Initial candidate: Razorpay or other India-compatible provider.

### Messaging

WhatsApp provider, SMS and email provider.

### Delivery

Porter or local/third-party provider when an official supported integration exists.

### Marketplaces

Swiggy/Zomato/ONDC where partner access, APIs and business terms support the intended workflow.

### Discovery/SEO

Google Business Profile/Search Console support where APIs or merchant workflows permit.

## Adapter structure

```text
/integrations
  /payments
  /messaging
  /delivery
  /marketplaces
  /google
```

Each adapter defines:

- capability support;
- auth/config requirements;
- request/response mapping;
- retry strategy;
- idempotency strategy;
- webhook verification;
- error normalization.

## Provider neutrality

Core modules should not import provider-specific SDK types.

## Failure behavior

External integration outages must degrade gracefully where the business can still operate.

Example: if delivery provider is down, manual dispatch should remain available.

## Credentials

Tenant/provider credentials are encrypted at rest and access-controlled. Secrets never appear in logs or client payloads.
