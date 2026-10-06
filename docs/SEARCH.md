# Search Strategy

## MVP

Use PostgreSQL queries/indexes for product/menu search.

Search should support:

- product name;
- category;
- tags/attributes where configured.

## Ranking principles

Prioritize:

1. active/purchasable items;
2. tenant scope;
3. exact/strong matches;
4. useful merchandising order.

## Future

A dedicated search service is justified only when:

- catalog size;
- latency;
- typo tolerance;
- analytics;
- ranking complexity

exceed what the database can reliably provide.
