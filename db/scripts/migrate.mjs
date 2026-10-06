#!/usr/bin/env node
// Applies db/migrations/*.sql in filename order against DATABASE_URL.
//
//   node db/scripts/migrate.mjs                    apply pending migrations
//   node db/scripts/migrate.mjs --status           list applied/pending, apply nothing
//   node db/scripts/migrate.mjs --baseline 0003    record 0001..0003 as applied WITHOUT running them
//                                                  (only for a database whose schema was created by hand)
//
// Each migration runs in its own transaction together with its schema_migrations
// row, so a failure leaves the database at the last fully applied migration.
// Applied files are checksummed; editing an applied migration is reported as drift
// and blocks further migration, because migration history is append-only.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, repoRoot } from "./connection.mjs";

const migrationsDir = join(repoRoot, "db/migrations");
const fileName = /^(\d{4})_[a-z0-9_]+\.sql$/;

function loadMigrations() {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const migrations = files.map((file) => {
    const match = fileName.exec(file);
    if (!match) throw new Error(`Migration file name must look like 0001_description.sql: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    return { version: match[1], name: file, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
  const seen = new Set();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Duplicate migration version ${m.version}`);
    seen.add(m.version);
  }
  return migrations;
}

function parseArgs(argv) {
  const args = { status: false, baseline: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--status") args.status = true;
    else if (argv[i] === "--baseline") args.baseline = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (args.baseline !== null && !/^\d{4}$/.test(args.baseline ?? "")) throw new Error("--baseline expects a 4-digit version, e.g. --baseline 0003");
  return args;
}

const ensureTable = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    execution_ms integer NOT NULL,
    baselined boolean NOT NULL DEFAULT false
  )`;

async function appliedRows(client) {
  const r = await client.query(`SELECT version, name, checksum, baselined FROM schema_migrations ORDER BY version`);
  return new Map(r.rows.map((row) => [row.version, row]));
}

function checkDrift(migrations, applied) {
  const problems = [];
  const known = new Set(migrations.map((m) => m.version));
  for (const m of migrations) {
    const row = applied.get(m.version);
    if (row && row.checksum !== m.checksum) problems.push(`${m.name} was modified after it was applied (checksum mismatch).`);
  }
  for (const [version, row] of applied) {
    if (!known.has(version)) problems.push(`${row.name} is recorded as applied but no longer exists in db/migrations.`);
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const migrations = loadMigrations();
  const { client, target } = await connect();
  console.log(`Database: ${target}`);
  try {
    await client.query(ensureTable);
    let applied = await appliedRows(client);

    const drift = checkDrift(migrations, applied);
    if (drift.length) {
      for (const p of drift) console.error(`DRIFT: ${p}`);
      throw new Error("Migration history does not match db/migrations. Add a new migration instead of editing an applied one.");
    }

    if (args.status) {
      for (const m of migrations) {
        const row = applied.get(m.version);
        console.log(`${row ? (row.baselined ? "baselined" : "applied  ") : "pending  "}  ${m.name}`);
      }
      return;
    }

    if (args.baseline) {
      const toMark = migrations.filter((m) => m.version <= args.baseline && !applied.has(m.version));
      for (const m of toMark) {
        await client.query(
          `INSERT INTO schema_migrations(version, name, checksum, execution_ms, baselined) VALUES ($1, $2, $3, 0, true) ON CONFLICT (version) DO NOTHING`,
          [m.version, m.name, m.checksum],
        );
        console.log(`baselined  ${m.name}`);
      }
      if (!toMark.length) console.log(`Nothing to baseline through ${args.baseline}.`);
      return;
    }

    // A schema created outside this tool (e.g. pasted into the Supabase SQL editor)
    // would make 0001 fail half-way with "type already exists"; stop with guidance instead.
    if (applied.size === 0) {
      const existing = await client.query(`SELECT to_regclass('public.tenants') IS NOT NULL AS present`);
      if (existing.rows[0].present) {
        throw new Error(
          "Table public.tenants already exists but schema_migrations is empty: this schema was created outside db:migrate.\n" +
            "If it matches some prefix of db/migrations, record those as applied with e.g. `pnpm db:migrate --baseline 0003`, then rerun `pnpm db:migrate`.\n" +
            "Otherwise reset the database and run `pnpm db:migrate` on an empty schema.",
        );
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.version));
    if (!pending.length) {
      console.log(`Up to date (${migrations.length} migrations applied).`);
      return;
    }

    for (const m of pending) {
      const started = Date.now();
      try {
        await client.query("BEGIN");
        // Serialise concurrent runners; transaction-scoped so it is safe behind PgBouncer/Supavisor.
        await client.query(`LOCK TABLE schema_migrations IN EXCLUSIVE MODE`);
        const already = await client.query(`SELECT 1 FROM schema_migrations WHERE version = $1`, [m.version]);
        if (already.rowCount) {
          await client.query("ROLLBACK");
          console.log(`skipped    ${m.name} (applied concurrently)`);
          continue;
        }
        await client.query(m.sql);
        await client.query(
          `INSERT INTO schema_migrations(version, name, checksum, execution_ms) VALUES ($1, $2, $3, $4)`,
          [m.version, m.name, m.checksum, Date.now() - started],
        );
        await client.query("COMMIT");
        console.log(`applied    ${m.name} (${Date.now() - started} ms)`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`${m.name} failed and was rolled back: ${error.message}`);
      }
    }
    applied = await appliedRows(client);
    console.log(`Done. ${applied.size}/${migrations.length} migrations applied.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`db:migrate failed: ${error.message}`);
  process.exit(1);
});
