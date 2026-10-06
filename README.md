# Restaurant OS — AI-Native Product Brain

Version: 0.1
Status: Product/architecture baseline for implementation
Primary pilot: a single Indian cloud kitchen / delivery-first restaurant
Long-term product: multi-tenant SaaS Restaurant OS for independent restaurants, cloud kitchens, cafes, bakeries, tiffin/meal businesses, food trucks and multi-brand kitchens.

## What this repository is

This repository is the source of truth for an AI-assisted engineering workflow. It contains product intent, scope, business rules, architecture, domain language, UX principles, implementation boundaries, roadmap and agent instructions.

The system should be built once and operated by many restaurant tenants. The pilot restaurant is a tenant, not a special code path.

## Start here

An AI agent working on this repository MUST read these files in order before making architectural or cross-domain changes:

1. `docs/PRODUCT_VISION.md`
2. `docs/PRODUCT_PRINCIPLES.md`
3. `docs/PRD.md`
4. `docs/PRODUCT_SCOPE.md`
5. `docs/DOMAIN_MODEL.md`
6. `docs/ARCHITECTURE.md`
7. `docs/BUSINESS_RULES.md`
8. `docs/TENANCY.md`
9. `engineering/AI_WORKFLOW.md`
10. `tasks/BACKLOG.md`

For a feature task, the agent MUST additionally read the relevant file under `specs/` and any referenced ADR.

## Product thesis

Restaurant owners need more than a website. They need a single system that helps them:

- get discovered locally;
- turn discovery into direct orders;
- own customer relationships;
- operate the kitchen efficiently;
- keep product availability accurate;
- orchestrate delivery;
- measure economics, not just gross sales;
- reduce dependence on fragmented tools and manual work.

The public website is the acquisition and commerce surface. The admin system is the operating system. Integrations connect external channels and delivery/payment providers.

## Core product loop

`Discover -> Browse -> Order -> Prepare -> Deliver -> Retain -> Analyze -> Improve`

## First release boundary

MVP is intentionally delivery-first and D2C-first:

- public restaurant storefront;
- menu/catalog management;
- stock ON/OFF availability;
- cart and checkout;
- payments;
- direct order management;
- delivery zones and manual dispatch;
- customer records;
- offers/coupons;
- basic analytics;
- WhatsApp/contact actions;
- Swiggy/Zomato outbound ordering links, subject to merchant/platform capabilities;
- multi-tenant foundations;
- SEO foundations;
- admin roles and audit logs.

Inventory recipes, KDS, automated delivery booking, advanced CRM, aggregator synchronization, loyalty, AI analytics and multi-outlet/multi-brand capabilities are planned later and must not leak into MVP unless required by a concrete workflow.

## Non-goals for MVP

- full accounting ERP;
- payroll/HR;
- table reservation;
- dine-in POS hardware integration;
- custom native customer mobile app;
- custom logistics fleet;
- guaranteed Google rankings;
- scraping or reverse engineering third-party platforms;
- microservice architecture;
- AI autonomy over financial or operational decisions.

## Working principle

Prefer the smallest reusable system that solves the pilot's real workflow and can later support multiple tenants without structural rewrites.

## Run locally

Prerequisites: Node 22, pnpm 10 (`corepack enable`), PostgreSQL (local or Supabase), Redis
(`docker compose up -d redis`, `brew install redis`, or an Upstash URL), and a Clerk application.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env                     # DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/admin/.env.example apps/admin/.env.local           # Clerk publishable + secret key
pnpm db:setup                                              # migrations + pilot seed (db/README.md)
SEED_OWNER_CLERK_USER_ID=user_xxx SEED_OWNER_EMAIL=you@example.com pnpm db:seed   # optional: make you OWNER
pnpm dev                                                   # API + worker :4000, storefront :3000, admin :3001
```

To try the new-restaurant wizard instead, set `SELF_SIGNUP_ENABLED=true` in `apps/api/.env` (off by default for the pilot). API docs: http://localhost:4000/docs.

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm test` | Domain unit tests + API integration tests against a throwaway Postgres |
| `pnpm test:e2e` | Playwright customer journeys against a running stack (`tests/README.md`) |
| `pnpm build` | Production builds (API bundle, storefront, admin) |
| `pnpm record` | Recorded walkthrough of admin + storefront together → `recordings/<date_time>/` (`tests/recording/README.md`) |

Operations: `engineering/RUNBOOK.md` (deploy, rollback). Pilot acceptance: `engineering/PILOT_UAT.md`.
Payments and customer messages are in test mode for the pilot (`decisions/ADR-010-pilot-mock-providers.md`).

## Repository map

- `docs/` — product, domain and system context
- `decisions/` — architecture decision records
- `roadmap/` — sequencing and release boundaries
- `specs/` — feature-level implementation contracts
- `tasks/` — epics and executable backlog
- `engineering/` — software and AI development process
- `ui/` — product design and UX standards
- `prompts/` — reusable instructions for different AI engineering roles

## Source-of-truth hierarchy

1. Product Vision
2. PRD and Product Scope
3. Domain Model and Business Rules
4. Architecture and ADRs
5. Feature Specifications
6. Task instructions
7. Code

When a lower layer conflicts with a higher layer, do not silently change the higher layer. Surface the conflict and update the appropriate source of truth first.
