#!/usr/bin/env node
// Loads deterministic development data (db/seeds/*.sql, in filename order) into DATABASE_URL.
// All seed files run in a single transaction; re-running is safe and converges to the same rows.
//
// Optional: map your Clerk account to an OWNER membership of the pilot tenant so the
// admin app and /v1/admin/* APIs work after signing in:
//   SEED_OWNER_CLERK_USER_ID=user_xxx SEED_OWNER_EMAIL=you@example.com pnpm db:seed
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, repoRoot } from "./connection.mjs";

const seedsDir = join(repoRoot, "db/seeds");
const migrationsDir = join(repoRoot, "db/migrations");
const pilotTenantId = "10000000-0000-4000-8000-000000000001";
const pilotOwnerUserId = "80000000-0000-4000-8000-000000000001";

async function assertMigrated(client) {
  const expected = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, 4));
  const table = await client.query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`);
  const applied = table.rows[0].present
    ? new Set((await client.query(`SELECT version FROM schema_migrations`)).rows.map((r) => r.version))
    : new Set();
  const missing = expected.filter((v) => !applied.has(v));
  if (missing.length) throw new Error(`Pending migrations (${missing.join(", ")}). Run \`pnpm db:migrate\` first.`);
}

async function seedOwner(client) {
  const clerkUserId = process.env.SEED_OWNER_CLERK_USER_ID?.trim();
  const email = process.env.SEED_OWNER_EMAIL?.trim() || null;
  if (!clerkUserId) return null;
  // Reuse an existing application user for this Clerk id or email; otherwise create one with a fixed id.
  const existing = await client.query(
    `SELECT id FROM users WHERE clerk_user_id = $1 OR ($2::text IS NOT NULL AND lower(email) = lower($2)) ORDER BY (clerk_user_id = $1) DESC NULLS LAST LIMIT 1`,
    [clerkUserId, email],
  );
  let userId;
  if (existing.rowCount) {
    userId = existing.rows[0].id;
    await client.query(`UPDATE users SET clerk_user_id = $2, email = coalesce($3, email), status = 'ACTIVE', updated_at = now() WHERE id = $1`, [userId, clerkUserId, email]);
  } else {
    if (!email) throw new Error("SEED_OWNER_EMAIL is required when creating the owner user (users need an email or phone).");
    userId = pilotOwnerUserId;
    await client.query(
      `INSERT INTO users (id, email, clerk_user_id, status) VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET email = excluded.email, clerk_user_id = excluded.clerk_user_id, status = 'ACTIVE', updated_at = now()`,
      [userId, email, clerkUserId],
    );
  }
  await client.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status)
     SELECT $1, $2, r.id, 'ACTIVE' FROM roles r WHERE r.name = 'OWNER'
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = excluded.role_id, status = 'ACTIVE', updated_at = now()`,
    [pilotTenantId, userId],
  );
  return userId;
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--allow-production")) {
    throw new Error("Refusing to seed development data with NODE_ENV=production (pass --allow-production to override).");
  }
  const files = readdirSync(seedsDir).filter((f) => f.endsWith(".sql")).sort();
  const { client, target } = await connect();
  console.log(`Database: ${target}`);
  try {
    await assertMigrated(client);
    await client.query("BEGIN");
    try {
      for (const file of files) {
        await client.query(readFileSync(join(seedsDir, file), "utf8"));
        console.log(`seeded     ${file}`);
      }
      const ownerId = await seedOwner(client);
      await client.query("COMMIT");
      if (ownerId) console.log(`owner      ${process.env.SEED_OWNER_CLERK_USER_ID} -> user ${ownerId} (OWNER of tenant ${pilotTenantId})`);
      else console.log("owner      skipped (set SEED_OWNER_CLERK_USER_ID and SEED_OWNER_EMAIL to link your Clerk account)");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
    const summary = await client.query(
      `SELECT (SELECT count(*) FROM categories WHERE tenant_id = $1)::int AS categories,
              (SELECT count(*) FROM products WHERE tenant_id = $1)::int AS products,
              (SELECT count(*) FROM tenants)::int AS tenants`,
      [pilotTenantId],
    );
    const s = summary.rows[0];
    console.log(`Done. Pilot tenant ${pilotTenantId}: ${s.categories} categories, ${s.products} products (${s.tenants} tenant(s) in database).`);
    console.log("Storefront brand slug: pilot   Outlet id: 30000000-0000-4000-8000-000000000001");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`db:seed failed: ${error.message}`);
  process.exit(1);
});
