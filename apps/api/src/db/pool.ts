import pg from "pg";
import { env } from "../config/env.ts";

// int8 (bigint, count(*)) -> number. Monetary values are minor units far below 2^53.
pg.types.setTypeParser(20, (value) => Number(value));
// numeric -> number (coordinates, ledger quantities).
pg.types.setTypeParser(1700, (value) => Number(value));

export type Db = pg.Pool | pg.PoolClient;
export type Tx = pg.PoolClient;

// Supabase requires TLS but its chain is not in Node's default trust store; a libpq sslmode in the
// URL would override the ssl object, so it is stripped when TLS is configured here.
export function connectionConfig(url: string): pg.PoolConfig {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  const wantsTls = parsed.hostname.includes("supabase.co") || (sslmode !== null && sslmode !== "disable");
  if (!wantsTls) return { connectionString: url };
  parsed.searchParams.delete("sslmode");
  return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
}

let instance: pg.Pool | undefined;

export function pool(): pg.Pool {
  if (!instance) {
    instance = new pg.Pool({
      ...connectionConfig(env().DATABASE_URL),
      max: env().DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // An idle client can be closed by the server at any time (pooler recycling, failover, restart). Without a
    // listener, pg re-emits that as an unhandled 'error' event and Node exits. The pool discards the broken client
    // and opens a new one on the next query, so logging is all that is needed here.
    instance.on("error", (error) => {
      process.stderr.write(`${JSON.stringify({ level: 50, time: Date.now(), msg: "postgres idle client error (client discarded)", err: error.message })}\n`);
    });
  }
  return instance;
}

export async function closePool(): Promise<void> {
  await instance?.end();
  instance = undefined;
}

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === "23505" && (constraint === undefined || e.constraint === constraint);
}
