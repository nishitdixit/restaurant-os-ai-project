# ADR-003: Next.js for Public Storefront

Status: Accepted

## Context

The public site is both a commerce surface and a search-discovery surface. Crawlability, performance and content rendering are important.

## Decision

Use Next.js/React for the public storefront, favoring server-rendered/static content and minimal client JavaScript where practical.

## Consequences

Positive:
- strong SEO implementation options;
- fast content delivery patterns;
- shared component ecosystem with admin.

Negative:
- requires careful client/server boundaries;
- SSR/cache behavior must be tested.
