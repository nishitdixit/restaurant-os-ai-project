# AI Agent Start Here

You are working on Restaurant OS, a multi-tenant SaaS platform for delivery-first food businesses.

Before changing code:

1. Read `README.md`.
2. Read `docs/PRODUCT_PRINCIPLES.md`.
3. Read `docs/DOMAIN_MODEL.md`.
4. Read `docs/BUSINESS_RULES.md`.
5. Read `docs/ARCHITECTURE.md`.
6. Read `engineering/AI_WORKFLOW.md`.
7. Read the relevant `specs/*/SPEC.md`.
8. Inspect existing implementation before adding abstractions.

## Non-negotiable invariants

- tenant isolation;
- server-authoritative pricing;
- payment webhook verification/idempotency;
- order submission idempotency;
- validated order state transitions;
- immutable historical order snapshots;
- provider adapters;
- no secrets in client code;
- public storefront performance/SEO/accessibility;
- no silent architecture drift.

## Implementation behavior

Implement the smallest task that satisfies the approved specification. Do not build future roadmap features unless the task explicitly requires them.

When requirements conflict:

- do not guess when the conflict affects money, security, tenancy or domain semantics;
- otherwise use the narrowest interpretation and document the assumption.

When a task materially changes architecture or domain semantics, propose/update an ADR before or with implementation.

## Final response for a coding task

Report:

- what changed;
- files/modules changed;
- tests run;
- known limitations;
- documentation/ADR changes;
- any unresolved decision requiring human review.
