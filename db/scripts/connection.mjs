// Shared DATABASE_URL resolution and pg client construction for db:* scripts.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// An explicit DATABASE_URL in the shell always wins. Otherwise fall back to the
// same env files the apps use, in order, without overriding anything already set.
const envFiles = [".env", "apps/api/.env"];

export function loadDatabaseUrl() {
  for (const file of envFiles) {
    if (process.env.DATABASE_URL) break;
    const path = join(repoRoot, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(`DATABASE_URL is not set. Export it or add it to one of: ${envFiles.join(", ")}`);
  }
  return url;
}

// Supabase requires TLS but its certificate chain is not in Node's default trust
// store; mirror apps/api/src/db/pool.ts. A libpq-style sslmode in the URL would
// override the ssl object inside pg, so it is stripped when TLS is configured here.
export function clientConfig(url) {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  const wantsTls = parsed.hostname.includes("supabase.co") || (sslmode !== null && sslmode !== "disable");
  if (!wantsTls) return { connectionString: url };
  parsed.searchParams.delete("sslmode");
  return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
}

export function redact(url) {
  const parsed = new URL(url);
  if (parsed.password) parsed.password = "***";
  return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
}

export async function connect() {
  const url = loadDatabaseUrl();
  const client = new pg.Client({ ...clientConfig(url), connectionTimeoutMillis: 10_000 });
  await client.connect();
  return { client, target: redact(url) };
}
