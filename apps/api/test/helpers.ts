// Integration test harness: a real PostgreSQL per test file with the real migrations and seed, and the
// real Fastify app driven through app.inject(). Only the identity provider is faked.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

export const repoRoot = resolve(import.meta.dirname, "../../..");
export const PILOT_TENANT = "10000000-0000-4000-8000-000000000001";
export const PILOT_OUTLET = "30000000-0000-4000-8000-000000000001";
export const P = {
  chickenBiryani: "50000000-0000-4000-8000-000000000001",
  vegBiryani: "50000000-0000-4000-8000-000000000002",
  muttonBiryani: "50000000-0000-4000-8000-000000000003", // seeded out of stock
  butterChicken: "50000000-0000-4000-8000-000000000004",
  dalMakhani: "50000000-0000-4000-8000-000000000006",
  naan: "50000000-0000-4000-8000-000000000007",
};
export const M = {
  regular: "53000000-0000-4000-8000-000000000001",
  family: "53000000-0000-4000-8000-000000000002",
  raita: "53000000-0000-4000-8000-000000000003",
  egg: "53000000-0000-4000-8000-000000000004",
};

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolvePort(port));
    });
    server.on("error", reject);
  });
}

let adminUrl: string | undefined;
const cleanups: (() => Promise<void>)[] = [];

/** Call once at the top level of each test file: `after(teardown)`. */
export async function teardown(): Promise<void> {
  for (const fn of cleanups.reverse()) await fn().catch(() => {});
}

async function adminConnection(): Promise<string> {
  if (adminUrl) return adminUrl;
  if (process.env.TEST_DATABASE_ADMIN_URL) return (adminUrl = process.env.TEST_DATABASE_ADMIN_URL);
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = mkdtempSync(join(tmpdir(), "ros-pg-"));
  const port = await freePort();
  const server = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "postgres", persistent: false, onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  cleanups.push(async () => {
    await server.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  });
  return (adminUrl = `postgresql://postgres:postgres@localhost:${port}/postgres`);
}

/** Creates a fresh database, applies all migrations and the pilot seed, and points the app at it. */
export async function setupDatabase(): Promise<string> {
  const admin = await adminConnection();
  const name = `ros_test_${process.pid}_${Date.now()}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`CREATE DATABASE ${name}`);
  await client.end();
  const url = admin.replace(/\/[^/]*$/, `/${name}`);
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" };
  execFileSync("node", [join(repoRoot, "db/scripts/migrate.mjs")], { env, stdio: "pipe" });
  execFileSync("node", [join(repoRoot, "db/scripts/seed.mjs")], { env, stdio: "pipe" });
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  // Onboarding tests exercise self-signup; production defaults it off (ADR-011 / env.ts).
  process.env.SELF_SIGNUP_ENABLED = process.env.SELF_SIGNUP_ENABLED ?? "true";
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), "ros-media-"));
  return url;
}

/** Fake identity provider: bearer token "user:<externalId>"; emails are registered per test. */
export class FakeVerifier {
  readonly emails = new Map<string, string>();
  async verify(token: string) {
    if (!token.startsWith("user:")) {
      const { AuthenticationError } = await import("../src/auth/clerk.ts");
      throw new AuthenticationError("Invalid token.");
    }
    return { externalUserId: token.slice(5) };
  }
  async verifiedEmail(externalUserId: string) {
    return this.emails.get(externalUserId) ?? null;
  }
}

export async function startApp() {
  const verifier = new FakeVerifier();
  const { buildApp } = await import("../src/app.ts");
  const app = await buildApp({ identityVerifier: verifier, logger: false, rateLimit: false });
  cleanups.push(async () => {
    await app.close();
    const { closePool } = await import("../src/db/pool.ts");
    await closePool();
  });
  return { app, verifier };
}

export async function db() {
  const { pool } = await import("../src/db/pool.ts");
  return pool();
}

/** Creates an application user with a membership; returns the bearer token to use. */
export async function createMember(tenantId: string, role: "OWNER" | "MANAGER" | "KITCHEN" | "STAFF", label = role.toLowerCase()) {
  const external = `ext_${label}_${Math.random().toString(36).slice(2, 8)}`;
  const d = await db();
  const user = await d.query<{ id: string }>(`INSERT INTO users (email, clerk_user_id) VALUES ($1, $2) RETURNING id`, [`${external}@example.com`, external]);
  await d.query(`INSERT INTO tenant_memberships (tenant_id, user_id, role_id) SELECT $1, $2, id FROM roles WHERE name = $3`, [tenantId, user.rows[0]!.id, role]);
  return { token: `user:${external}`, userId: user.rows[0]!.id, external };
}

export function headers(token: string, tenantId = PILOT_TENANT, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${token}`, "x-tenant-id": tenantId, ...extra };
}

export const address = { line1: "4th Cross, HAL 2nd Stage", line2: "", landmark: "Near park", city: "Bengaluru", region: "Karnataka", postalCode: "560038" };

export function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    lines: [{ productId: P.butterChicken, quantity: 1, modifierIds: [] }, { productId: P.naan, quantity: 2, modifierIds: [] }],
    fulfillmentType: "DELIVERY",
    address,
    promotionCode: "",
    customer: { name: "Asha Rao", phone: "98450 12345", email: "asha@example.com", marketingConsent: true },
    customerNote: "",
    paymentMethod: "ONLINE",
    ...overrides,
  };
}

/** Quotes and places an order with the server's own total; returns the place-order response. */
export async function placeOrder(app: Awaited<ReturnType<typeof startApp>>["app"], body: Record<string, unknown>, key = `test-${Math.random().toString(36).slice(2)}`) {
  const quote = await app.inject({ method: "POST", url: "/v1/storefront/pilot/checkout/quote", payload: { ...body, customerPhone: (body.customer as { phone: string }).phone } });
  const expectedTotalMinor = quote.json().totalMinor;
  return app.inject({ method: "POST", url: "/v1/storefront/pilot/orders", headers: { "idempotency-key": key }, payload: { ...body, expectedTotalMinor } });
}

/** The pilot outlet is seeded with day-time hours; tests open it around the clock. */
export async function openAllDay() {
  const d = await db();
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, [["00:00", "23:59"], ["23:59", "00:00"]]]));
  await d.query(`UPDATE outlets SET hours = $1 WHERE id = $2`, [JSON.stringify(hours), PILOT_OUTLET]);
}
