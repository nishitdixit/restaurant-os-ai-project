# Operations Runbook

How to deploy, verify, roll back and troubleshoot Restaurant OS. Pairs with `engineering/RELEASE.md`.

## Components

| Component | Image target | Needs | Health |
| --- | --- | --- | --- |
| API | `api` | Postgres, Clerk secret | `GET /health` (process), `GET /ready` (database) |
| Worker | `worker` | Postgres, Redis | logs `worker started`; queue depth in Redis |
| Storefront | `storefront` | API (public + `API_INTERNAL_URL`) | `GET /robots.txt` |
| Admin | `admin` | API, Clerk publishable + secret key | sign-in page loads |

Images are built per tag by `.github/workflows/deploy.yml` and tagged with the commit SHA.

## Deploy (in this order)

1. **Back up** the database (Supabase: Database → Backups, or `pg_dump`). Note the current image SHA of every component.
2. **Migrate**: `DATABASE_URL=… pnpm db:migrate` (or run the API image with `node db/scripts/migrate.mjs`).
   Migrations are additive (new tables/columns/indexes only; see `engineering/DATABASE_MIGRATIONS.md`), so the
   *previous* API version keeps working against the new schema.
3. **API, then worker**: deploy the new images. Wait for `/ready` to return 200.
4. **Storefront and admin**.
5. **Smoke test** (5 minutes):
   - storefront home and `/menu` load; `/sitemap.xml` lists products;
   - place a pickup order on the storefront and complete the test-mode payment;
   - the order appears on the admin board within 10 s; accept → ready → collected;
   - admin → Messages shows "Order confirmed" and "Order accepted" as **Sent**;
   - admin → Analytics today shows the order.
6. Watch logs for 15 minutes: no rise in 5xx (`"level":50`), no `job failed` loops in the worker.

## Rollback

Use when a release misbehaves and a forward fix isn't quick.

1. **Stop the bleeding**: if orders are affected, pause ordering (admin top bar → *Taking orders* switch, or
   `UPDATE outlets SET accepting_orders = false`). Customers can still browse; nothing is lost.
2. **Redeploy the previous image SHAs** for storefront/admin, then API/worker (reverse of deploy order).
3. **Database**: do **not** roll migrations back. Because every migration is additive, the previous code
   runs against the newer schema. `schema_migrations` must keep the new rows; editing or deleting an applied
   migration file makes `db:migrate` stop with a `DRIFT` error by design.
   - Only if a migration itself corrupted data: restore the pre-deploy backup into a new database, verify, and
     point `DATABASE_URL` at it. Orders placed since the backup must be re-entered from the order list export
     of the bad database — agree this with the restaurant before doing it.
4. Resume ordering, re-run the smoke test, and write up the incident (what, impact, fix, prevention).

## Common situations

| Symptom | Check | Fix |
| --- | --- | --- |
| Storefront shows "Coming soon" | Brand published? | Admin → Home → *Publish storefront* (setup checklist must be complete). |
| "Can't reach the server" in admin | API `/ready`, CORS | `CORS_ORIGINS` must include the admin and storefront origins. |
| Admin says account not linked | `users.clerk_user_id` | Invite the email from Settings → Team, or seed an owner (`SEED_OWNER_CLERK_USER_ID`). |
| Customers not getting messages | Admin → Messages | Worker running? `REDIS_URL` set? Failed messages can be retried from that screen. |
| Unpaid orders never expire | Worker logs | The worker runs `expire-unpaid-orders` every minute; start it. |
| A paid order was cancelled before payment arrived | Order shows "refund needed" | Open the order → *Refund now*. The merchant also gets an alert in Messages. |
| Delivery not offered for a pincode | Delivery areas | Add the pincode to an active area, or tell the customer to use pickup. |
| Images 404 after redeploy | `STORAGE_DRIVER` | Local storage lives on the API container disk; use `STORAGE_DRIVER=s3` in deployed environments. |

## Routine

- Daily: glance at Messages → *Failed*; Orders → *Awaiting payment* should empty itself within the payment window.
- Weekly: confirm backups exist; review the audit log for unexpected price or team changes.
