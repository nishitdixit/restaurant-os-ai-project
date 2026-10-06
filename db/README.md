# Database

PostgreSQL schema, migrations, and development seed data.

```
db/
  migrations/   0001_*.sql ... 0007_*.sql, append-only schema history (never edit an applied file)
  seeds/        deterministic development data, applied by `pnpm db:seed`
  scripts/      migrate.mjs, seed.mjs, connection.mjs
```

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Applies pending `db/migrations/*.sql` in filename order. Each file runs in its own transaction with its `schema_migrations` row. |
| `pnpm db:status` | Lists every migration as `applied`, `baselined` or `pending`. Changes nothing. |
| `pnpm db:seed` | Upserts the pilot restaurant data from `db/seeds/*.sql` in one transaction. Requires every migration to be applied. Safe to re-run. |
| `pnpm db:setup` | Runs `db:migrate`, then `db:seed`. |

### Which database

The scripts use the first `DATABASE_URL` found in:

1. the shell environment;
2. `.env` at the repository root;
3. `apps/api/.env`.

The API reads `apps/api/.env` too, so one setting covers both.

TLS is turned on automatically for `*.supabase.co` / `*.supabase.com` hosts, or when the URL has an `sslmode` other than `disable`.

### Supabase connection string

In the Supabase dashboard, go to **Connect** and copy the **Session pooler** URI. It looks like `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.

- The direct connection (`db.<ref>.supabase.co`) is IPv6-only on many networks.
- The transaction pooler (port 6543) also works with these scripts.
- URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`).

## Migration history rules

- `schema_migrations` records the version, file name, SHA-256 checksum and run time of every applied migration.
- If an applied file has changed, or a recorded migration's file is missing, `db:migrate` and `db:status` stop with a `DRIFT` error. To change the schema, add a new file with the next number, e.g. `0007_<description>.sql`.
- Concurrent runs are serialised with a transaction-scoped table lock, which is safe behind PgBouncer/Supavisor.

### A schema created by hand

This covers a database where some migrations were pasted into the SQL editor before this tool existed. If `tenants` exists but `schema_migrations` is empty, `db:migrate` refuses to run. In that case, either:

- **Reset the schema and migrate from scratch.** This is easiest for a dev database with no data you need:
  ```sql
  -- Supabase SQL editor. DESTROYS all data in the public schema.
  DROP SCHEMA public CASCADE; CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
  ```
  then run `pnpm db:setup`.
- **Record what was already applied, without running it.** For example, if exactly 0001–0003 were applied:
  ```sh
  pnpm db:migrate --baseline 0003
  pnpm db:migrate        # applies 0004 onward
  ```
  Only do this if those files really were applied in full. The runner cannot check that for you.

## Seed data

The seed lives in `db/seeds/0001_pilot_restaurant.sql`. Every row has a fixed ID, so the IDs are the same on every machine:

| Entity | Value |
| --- | --- |
| Tenant | `10000000-0000-4000-8000-000000000001` (Pilot Restaurant) |
| Brand | `20000000-0000-4000-8000-000000000001`, slug `pilot` |
| Outlet | `30000000-0000-4000-8000-000000000001` |
| Menu | 4 categories, 10 products in paise. Mutton Biryani is marked out of stock. |
| Delivery zone | Postal codes 560038/560008/560071/560075, ₹30 fee, ₹199 minimum |
| Promotion | `WELCOME50`: ₹50 off a first order of ₹299 or more (new customers, once each), valid until 2030-12-31 |
| Options | "Portion" (required) and "Add-ons" (up to 2) on the biryanis |

`0003_pilot_mvp.sql` creates a "Pilot Restaurant" tenant with a random ID on an empty database. The seed takes that row over under the fixed ID, so you end up with a single pilot tenant.

The seed never deletes data. Orders, customers and products created through the app are kept. It refuses to run when `NODE_ENV=production`.

### Admin access (Clerk → OWNER)

Admin APIs need an application user linked to your Clerk user ID, with a tenant membership. To make your account the pilot tenant's OWNER:

```sh
SEED_OWNER_CLERK_USER_ID=user_XXXXXXXX SEED_OWNER_EMAIL=you@example.com pnpm db:seed
```

Your Clerk user ID (`user_...`) is in the Clerk dashboard under **Users**. Send `x-tenant-id: 10000000-0000-4000-8000-000000000001` with admin API calls.
