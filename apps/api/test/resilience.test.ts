// Regression: the API must survive PostgreSQL closing idle connections (pooler recycling, failover).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db, setupDatabase, startApp, teardown } from "./helpers.ts";

let app: Awaited<ReturnType<typeof startApp>>["app"];
let url: string;

after(teardown);
before(async () => {
  url = await setupDatabase();
  ({ app } = await startApp());
});

test("terminated idle connections are discarded, not fatal", async () => {
  const d = await db();
  await Promise.all([d.query("SELECT 1"), d.query("SELECT 1"), d.query("SELECT 1")]);
  assert.ok(d.idleCount > 0, "pool has idle clients");
  const admin = new pg.Client({ connectionString: url.replace(/\/[^/]*$/, "/postgres") });
  await admin.connect();
  const name = new URL(url).pathname.slice(1);
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [name]);
  await admin.end();
  await new Promise((r) => setTimeout(r, 300));
  const res = await app.inject("/ready");
  assert.equal(res.statusCode, 200);
  assert.equal((await app.inject("/v1/storefront/pilot/menu")).statusCode, 200);
});
