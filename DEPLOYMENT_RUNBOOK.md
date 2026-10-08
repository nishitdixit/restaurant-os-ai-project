# Deployment Runbook — Hosted Demo

How to deploy Restaurant OS for supervised demos with restaurant owners. Follow the steps in order. For day-2
operations (rollback, troubleshooting), see `engineering/RUNBOOK.md`.

| Part | Where | What runs |
| --- | --- | --- |
| Storefront | Vercel project, root `apps/storefront` | Next.js |
| Admin | Vercel project, root `apps/admin` | Next.js + Clerk |
| API | Render Web Service | `apps/api` → `dist/main.js` |
| Worker | Render Background Worker | `apps/api` → `dist/worker.js` |
| Redis | Render Key Value | BullMQ queues, rate limits |
| Database | Supabase Postgres, **Session pooler** | migrations from `db/migrations` |
| Images | Supabase Storage, S3 protocol | public bucket |
| Auth | Clerk, existing **development** instance (`pk_test_…`) | |
| Payments | Mock provider, "Test mode — no real money moves" | |

What the demo does **not** do: take real payments, or send real WhatsApp/SMS/email. Messages are recorded under
admin → Messages. Each storefront deployment serves one restaurant (the seeded `pilot`).

Write down these values as you go. Steps further down need them:

```
SUPABASE_REF        = <project ref>                      (step A1)
SUPABASE_REGION     = <e.g. ap-south-1>                  (step A1)
POOLER_URL          = postgresql://postgres.<ref>:...    (step A2)
S3_*                                                      (step A5)
CLERK_PK / CLERK_SK / CLERK_USER_ID                       (step B)
REDIS_INTERNAL_URL                                        (step C)
API_URL             = https://<api-service>.onrender.com  (step D)
STOREFRONT_URL      = https://<storefront>.vercel.app     (step F)
ADMIN_URL           = https://<admin>.vercel.app          (step G)
```

All URLs use `https://` and have **no trailing slash**.

---

## A. Supabase

1. Open your Supabase project, or create one in the region closest to your customers. Note its **project ref**
   (the `<ref>` in `https://<ref>.supabase.co`) and **region** (Project Settings → General).
2. **Connection string**: click **Connect** → **Session pooler** and copy the URI:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   - Do not use the "Direct connection" host `db.<ref>.supabase.co`. It is IPv6-only, and Render cannot reach it.
   - Do not use the Transaction pooler (port 6543).
   - Percent-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
   - TLS is turned on automatically for `*.supabase.co` and `*.supabase.com` hosts. Don't add `sslmode`.
3. **Turn off the Data API.** The app connects to Postgres directly, and its tables have no row-level security.
   Go to Project Settings → Data API and disable it, or remove `public` from "Exposed schemas". This stops the
   tables being reachable through `https://<ref>.supabase.co/rest/v1`.
4. **Migrate** from your laptop at the repo root, with dependencies installed (`pnpm install`):
   ```bash
   export DATABASE_URL='<POOLER_URL>'
   pnpm db:status      # lists applied / pending migrations
   pnpm db:migrate     # applies 0001–0010; prints "Done. 10/10 migrations applied."
   pnpm db:status      # all "applied"
   ```
   The db scripts use an exported `DATABASE_URL` first. Without one they fall back to `apps/api/.env`, so always
   export it explicitly.
5. **Storage**:
   - Storage → New bucket. Name it, for example, `media`, and turn **Public bucket** on.
   - Project Settings → Storage → **S3 Connection**: confirm S3 protocol access is enabled. Copy the **Endpoint**
     (`https://<ref>.supabase.co/storage/v1/s3`) and **Region**.
   - Same page → **S3 Access Keys** → New access key. Copy the **Access key ID** and **Secret access key**. The
     secret is shown only once.
   - The public base URL is `https://<ref>.supabase.co/storage/v1/object/public/<bucket>`.
6. The **one-time seed** comes after step B, because it needs your Clerk user ID.

## B. Clerk

Use the existing development instance. Production Clerk needs a custom domain and is out of scope here.

1. Clerk dashboard → your application → **API keys**: copy the **Publishable key** (`pk_test_…`) and the
   **Secret key** (`sk_test_…`).
2. **Users** → Create user, using the email you will sign in with (or use an existing user). Copy the
   **User ID** (`user_…`).
3. **One-time seed.** This creates the pilot restaurant with its menu and delivery areas, and makes you its OWNER:
   ```bash
   export DATABASE_URL='<POOLER_URL>'
   SEED_OWNER_CLERK_USER_ID='user_…' SEED_OWNER_EMAIL='you@example.com' pnpm db:seed
   ```
   Run it **once**. Running it again resets the seeded restaurant's menu rows, hours and delivery areas to the seed
   values, overwriting your edits. Do not set `NODE_ENV=production` in this shell: the seed refuses to run in
   production.
4. The admin's sign-in and sign-up pages are `/sign-in` and `/sign-up`. Nothing else needs configuring in Clerk:
   development instances accept `*.vercel.app` origins. The admin shows a small "Development mode" badge.
   Clerk webhooks are not used.
5. More people can sign in later after you invite their email from admin → Settings → Team. Self sign-up is off.

## C. Render Key Value (Redis)

1. Render → New → **Key Value**. Pick a region and use the **same region** for the API and the worker. Choose a
   paid instance type for a demo that must stay up.
2. **Maxmemory policy: `noeviction`.** BullMQ needs this; evicted keys silently lose queued jobs.
3. After creation, copy the **Internal Key Value URL** (`redis://red-…:6379`).

## D. Render API (Web Service)

1. Render → New → **Environment Group** named `restaurant-os-api`. Add every variable from the
   [API + worker table](#api--worker--render-environment-group-restaurant-os-api). For now, leave
   `CORS_ORIGINS`, `STOREFRONT_URL`, `ADMIN_URL` and `CLERK_AUTHORIZED_PARTIES` out; you add them in step H.
2. Render → New → **Web Service** → connect the GitHub repo → branch `main`.
   - Language: **Node**. Root Directory: *(blank, the repo root)*. Region: the same as step C.
   - Build Command:
     ```
     corepack enable && pnpm install --frozen-lockfile --prod=false --filter "@restaurant-os/api..." && pnpm --filter @restaurant-os/api build
     ```
   - Start Command:
     ```
     pnpm --filter @restaurant-os/api start
     ```
   - Health Check Path: `/ready`
   - Instance type: Starter or higher. Free instances sleep, and the first request then takes about a minute.
   - Environment: link the `restaurant-os-api` group.
3. Deploy. Copy the service URL (`https://<name>.onrender.com`), set `API_PUBLIC_URL` to it in the group, and
   save. Render redeploys.
4. Check `https://<api>/health` → `{"status":"ok"}` and `https://<api>/ready` → `{"status":"ready"}`.

Notes:
- `--prod=false` is required: `NODE_ENV=production` would otherwise skip `tsup`, which the build needs.
- `--filter "@restaurant-os/api..."` installs only the API and its workspace packages, not the test and
  recording tooling.
- Node 22 is pinned through `engines` in the root `package.json`.
- If `corepack enable` fails on Render, replace it with `npm i -g pnpm@10.12.4`.

## E. Render Worker (Background Worker)

1. Render → New → **Background Worker** → same repo, branch, region and Root Directory as step D.
   - Build Command: same as step D.
   - Start Command:
     ```
     pnpm --filter @restaurant-os/api start:worker
     ```
   - Environment: link the same `restaurant-os-api` group.
2. Deploy. The logs should show `"msg":"worker started"` with the queues `ros-events`, `ros-notifications` and
   `ros-maintenance`.

## F. Vercel Storefront

1. Vercel → Add New → Project → import the repo.
   - Root Directory: `apps/storefront`. Framework preset: **Next.js**.
   - Install Command (override):
     ```
     pnpm install --frozen-lockfile --filter "@restaurant-os/storefront..."
     ```
   - Build Command: default (`next build`). Output: default.
   - Settings → General → Node.js Version: **22.x**.
2. Add the variables from the [storefront table](#storefront--vercel-project-apps-storefront). Leave
   `NEXT_PUBLIC_ADMIN_URL` empty until step G exists.
3. Deploy. Copy the **production domain** (`https://<project>.vercel.app`), set `NEXT_PUBLIC_SITE_URL` to it,
   then **Redeploy**.

## G. Vercel Admin

1. Vercel → Add New → Project → the same repo.
   - Root Directory: `apps/admin`. Framework preset: **Next.js**.
   - Install Command (override):
     ```
     pnpm install --frozen-lockfile --filter "@restaurant-os/admin..."
     ```
   - Build Command: default. Node.js Version: **22.x**.
2. Add the variables from the [admin table](#admin--vercel-project-apps-admin).
3. Deploy. Copy the production domain (`https://<project>.vercel.app`).

## H. Connect the URLs (required — do not skip)

Some services need URLs that only exist after other services are created:

1. **Storefront (Vercel)**: set `NEXT_PUBLIC_ADMIN_URL` = `ADMIN_URL`, then **Redeploy**. This value is read at
   build time and allows the admin's Appearance live preview to embed the store.
2. **Render group `restaurant-os-api`**: add
   - `CORS_ORIGINS` = `<STOREFRONT_URL>,<ADMIN_URL>`
   - `STOREFRONT_URL` = `<STOREFRONT_URL>`
   - `ADMIN_URL` = `<ADMIN_URL>`
   - `CLERK_AUTHORIZED_PARTIES` = `<ADMIN_URL>`

   Save. Render redeploys the API and the worker.
3. Changing any `NEXT_PUBLIC_*` variable on Vercel needs a **Redeploy**, because these values are fixed when the
   app is built.

## I. Before each demo

- admin → Settings → Kitchen & hours: the seeded hours are 11:00–23:00 (23:30 Fri/Sat) Asia/Kolkata. Outside those
  hours the store is closed and checkout is blocked.
- admin top bar: **Taking orders** is on.
- Delivery: the seeded areas are Bengaluru pincodes 560038, 560008, 560071 and 560075. For other locations, use
  **Pickup**, or add the pincode under admin → Delivery areas.
- Render free instances sleep. Use paid instances, or open `/ready` a minute before the demo.

---

## Environment variables

**Secret** means: never commit it, never put it in a `NEXT_PUBLIC_*` variable, and keep it only in the
Render/Vercel dashboards. **Build-time** means the value is compiled into the Next.js build, so a change needs a
Vercel redeploy.

### API + worker — Render Environment Group `restaurant-os-api`

Both services read the same variables. The worker runs the same production checks at startup.

| Variable | Value / where to get it | Secret | Set when |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | No | D1 |
| `TRUST_PROXY` | `true` (Render's proxy; rate limits use the real client IP) | No | D1 |
| `DATABASE_URL` | `POOLER_URL` (A2) | **Yes** | D1, after A |
| `DATABASE_POOL_MAX` | `5` (API + worker stay under the session pooler's client limit) | No | D1 |
| `REDIS_URL` | `REDIS_INTERNAL_URL` (C3) | **Yes** | D1, after C |
| `CLERK_SECRET_KEY` | Clerk → API keys (B1) | **Yes** | D1, after B |
| `PAYMENT_PROVIDER` | `mock` | No | D1 |
| `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION` | `true` (without it, the API refuses to start) | No | D1 |
| `MOCK_PAYMENT_SECRET` | generate: `openssl rand -hex 32` | **Yes** | D1 |
| `PREVIEW_SECRET` | generate: `openssl rand -hex 32` (a different value) | **Yes** | D1 |
| `STORAGE_DRIVER` | `s3` | No | D1 |
| `S3_ENDPOINT` | `https://<ref>.supabase.co/storage/v1/s3` (A5) | No | D1, after A |
| `S3_REGION` | Supabase project region, e.g. `ap-south-1` (A5) | No | D1, after A |
| `S3_BUCKET` | bucket name, e.g. `media` (A5) | No | D1, after A |
| `S3_ACCESS_KEY_ID` | Supabase S3 access key ID (A5) | **Yes** | D1, after A |
| `S3_SECRET_ACCESS_KEY` | Supabase S3 secret access key (A5) | **Yes** | D1, after A |
| `S3_PUBLIC_BASE_URL` | `https://<ref>.supabase.co/storage/v1/object/public/<bucket>` | No | D1, after A |
| `API_PUBLIC_URL` | the Render service URL | No | D3, after the API exists |
| `CORS_ORIGINS` | `<STOREFRONT_URL>,<ADMIN_URL>` | No | H2, after F and G |
| `STOREFRONT_URL` | Vercel storefront domain | No | H2, after F |
| `ADMIN_URL` | Vercel admin domain | No | H2, after G |
| `CLERK_AUTHORIZED_PARTIES` | `<ADMIN_URL>` | No | H2, after G |
| `SELF_SIGNUP_ENABLED` | `false` (the default) | No | optional |
| `LOG_LEVEL` | `info` (the default) | No | optional |
| `PAYMENT_WINDOW_MINUTES` | `30` (the default) | No | optional |
| `MOCK_NOTIFICATION_MODE` | `succeed` (the default) | No | optional |
| `PORT` | **do not set**; Render provides it | — | — |

Not used in this deployment: `RAZORPAY_*`, `MEDIA_DIR`, `HOST`.

### Storefront — Vercel project `apps/storefront`

Every variable here is **build-time**.

| Variable | Value / where to get it | Secret | Set when |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `API_URL` (D3) | No | F2, after D |
| `API_INTERNAL_URL` | `API_URL` (optional; defaults to the above) | No | F2 |
| `NEXT_PUBLIC_STORE_BRAND_SLUG` | `pilot` | No | F2 |
| `NEXT_PUBLIC_SITE_URL` | this project's production domain | No | F3, then redeploy |
| `MEDIA_PUBLIC_BASE_URLS` | same as `S3_PUBLIC_BASE_URL` (allows Next.js image optimisation for that host) | No | F2, after A |
| `NEXT_PUBLIC_ADMIN_URL` | `ADMIN_URL` (allows the Appearance preview frame) | No | H1, after G, then redeploy |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the repo's pinned pnpm 10.12.4) | No | F2 |

### Admin — Vercel project `apps/admin`

| Variable | Value / where to get it | Secret | Build-time | Set when |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API keys (B1) | No | Yes | G2, after B |
| `CLERK_SECRET_KEY` | Clerk → API keys (B1), the same key as the API's | **Yes** | No | G2, after B |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | No | Yes | G2 |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | No | Yes | G2 |
| `NEXT_PUBLIC_API_BASE_URL` | `API_URL` (D3) | No | Yes | G2, after D |
| `NEXT_PUBLIC_STOREFRONT_URL` | `STOREFRONT_URL` (F3) | No | Yes | G2, after F |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | No | — | G2 |

### One-time seed (your laptop only; never on Render)

| Variable | Value | Secret |
| --- | --- | --- |
| `DATABASE_URL` | `POOLER_URL` | **Yes** |
| `SEED_OWNER_CLERK_USER_ID` | Clerk → Users → your user ID | No |
| `SEED_OWNER_EMAIL` | that user's email | No |

---

## Commands

```bash
# Database (repo root, from your laptop)
export DATABASE_URL='<POOLER_URL>'
pnpm db:status                                   # applied / pending migrations
pnpm db:migrate                                  # apply pending migrations (additive; safe to re-run)
SEED_OWNER_CLERK_USER_ID='user_…' SEED_OWNER_EMAIL='you@example.com' pnpm db:seed   # ONCE only
```

**Local production check (optional, before deploying)**: builds and runs the API and storefront in production
mode on your machine. Put the hosted API values into `apps/api/.env.production.local`. Files named `.env.*` are
gitignored. Use `TRUST_PROXY=false`, `API_PUBLIC_URL=http://localhost:4000`,
`CORS_ORIGINS=http://localhost:3000,http://localhost:3001`, `STOREFRONT_URL=http://localhost:3000` and
`ADMIN_URL=http://localhost:3001`. `REDIS_URL` can be omitted, because the API runs without it.

```bash
pnpm install
pnpm --filter @restaurant-os/api build
node --env-file=apps/api/.env.production.local apps/api/dist/main.js     # terminal 1
curl -s localhost:4000/ready                                             # {"status":"ready"}

cd apps/storefront                                                       # terminal 2
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
NEXT_PUBLIC_ADMIN_URL=http://localhost:3001 MEDIA_PUBLIC_BASE_URLS='<S3_PUBLIC_BASE_URL>' \
  pnpm exec next build && pnpm exec next start -p 3000                   # open http://localhost:3000
```

This check uses your real Supabase database, so any order you place lands there.

---

## Smoke test (after step H)

| # | Check | Expected |
| --- | --- | --- |
| 1 | `<API_URL>/ready` | `{"status":"ready"}` |
| 2 | Render worker logs | `worker started`; no repeating `job failed` |
| 3 | **Admin login**: open `<ADMIN_URL>` and sign in with the seeded Clerk user | Dashboard for the pilot restaurant (not "account not linked", not "Can't reach the server") |
| 4 | **Storefront**: open `<STOREFRONT_URL>` on a phone and a laptop | Home page with the pilot brand, not "Coming soon" |
| 5 | **Menu**: `/menu`, a category, a dish page, search | Dishes and prices load; out-of-stock Mutton Biryani can't be added |
| 6 | **Cart**: add a dish with options, change the quantity, open the cart | Totals update; delivery fee preview shows |
| 7 | **Checkout**: Pickup (or a seeded pincode), name, phone, place order | Redirects to the payment page marked "Test mode — no real money moves" |
| 8 | **Mock payment**: pay | Order status page shows the order as confirmed |
| 9 | **Order in admin**: admin → Orders | The new order appears within about 10 s, with a sound alert |
| 10 | **Accept / complete**: accept → ready → collected (or dispatch → delivered) | Status updates on the board and on the customer's status page |
| 11 | **Messages**: admin → Messages | "Order confirmed" / "Order accepted" show **Sent** (recorded only, not delivered) |
| 12 | **Image upload**: admin → Menu → a dish → add a photo | Upload succeeds; the image URL starts with `S3_PUBLIC_BASE_URL`; the photo shows on the storefront dish page |
| 13 | **Appearance live preview**: admin → Appearance → pick a style | The storefront preview frame loads and changes; Publish updates `<STOREFRONT_URL>` |
| 14 | Redeploy the API, then reload the dish from step 12 | The photo is still there (stored in S3, not on disk) |

If something fails:
- "Can't reach the server" in admin: check `CORS_ORIGINS` and `NEXT_PUBLIC_API_BASE_URL`.
- The preview frame is blank or refused: check `NEXT_PUBLIC_ADMIN_URL` on the storefront, then redeploy it.
- Images are broken on the storefront: check `MEDIA_PUBLIC_BASE_URLS`, then redeploy, and confirm the bucket is
  public.
- "Account not linked": the seed ran without `SEED_OWNER_*`. Run it again with them, which resets the seeded menu
  (see B3).
- More cases: `engineering/RUNBOOK.md` → Common situations.
