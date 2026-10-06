# AI Engineering Workflow

## Purpose

This project is designed for AI-assisted engineering with strong context control.

## Mandatory behavior for every agent

1. Read the repository instructions relevant to the task.
2. Identify the authoritative product/domain concepts.
3. State the implementation plan internally before editing.
4. Inspect existing code before introducing abstractions.
5. Reuse existing concepts when possible.
6. Do not silently alter architecture or business rules.
7. Implement the smallest coherent change.
8. Add/update tests.
9. Run the relevant validation commands.
10. Update documentation/contracts if behavior changed.

## Task context protocol

For every task, provide or infer:

- objective;
- user/persona;
- relevant spec;
- acceptance criteria;
- constraints;
- files/modules expected to change;
- explicit non-goals.

If an essential requirement is ambiguous but safe to defer, choose the least expansive interpretation and document it. If ambiguity could affect money, privacy, tenancy, security or domain semantics, stop and surface it before implementation.

## Agent roles

### Product Agent

Turns user needs into precise requirements, edge cases, acceptance criteria and scope decisions.

### Architect Agent

Maintains domain boundaries, architecture, ADRs and cross-module contracts.

### Backend Agent

Implements server/domain/database work against approved specs.

### Frontend Agent

Implements storefront/admin UI against approved domain/API contracts and UX rules.

### QA Agent

Designs edge cases, test plans, regression coverage and release validation.

### Reviewer Agent

Checks correctness, security, tenancy, architecture drift and requirement alignment.

### Documentation Agent

Keeps source-of-truth documents synchronized with changed behavior.

## Context loading

Do not load every document for every task. Use layered context:

### Always

- README.md
- PRODUCT_PRINCIPLES.md
- ARCHITECTURE.md
- DOMAIN_MODEL.md
- BUSINESS_RULES.md
- CODING_STANDARDS.md

### Then

Load only the relevant feature specs and ADRs.

## Change discipline

Before a cross-cutting change, the agent must answer:

- Which domain concepts change?
- Which invariants change?
- Which APIs change?
- Which data migrations are required?
- Which integrations are affected?
- Which tests cover regression?
- Does the PRD/roadmap need updating?

## Definition of done

A task is not done when code compiles. It is done when:

- acceptance criteria pass;
- tests exist for material business rules;
- no tenant boundary is violated;
- errors are handled;
- observability is sufficient;
- API/docs are updated where required;
- migration is safe;
- unrelated behavior is not broken.

## AI anti-patterns

Do not:

- invent a duplicate domain entity;
- create speculative abstractions “for future scale”;
- use mock data in production paths without a clear boundary;
- bypass validation because a screen already validates it;
- trust client-side totals;
- trust browser payment state;
- make third-party API calls directly from domain services;
- add AI-generated features without a product requirement;
- rewrite large files when a targeted change suffices.

## Human approval gates

Required human review for:

- architecture changes;
- auth/security changes;
- payment logic;
- tenancy model changes;
- destructive migrations;
- new external integrations;
- automated customer messaging;
- pricing or refund automation.

## Context drift check

At the end of a task, compare implementation to:

`PRD -> DOMAIN_MODEL -> BUSINESS_RULES -> SPEC -> CODE`

Any mismatch is either corrected or recorded as an explicit decision.
