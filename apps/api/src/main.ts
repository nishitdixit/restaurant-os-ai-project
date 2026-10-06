import { mkdir } from "node:fs/promises";
import { buildApp } from "./app.ts";
import { env, loadEnv } from "./config/env.ts";
import { closePool } from "./db/pool.ts";
import { mediaRoot } from "./integrations/storage.ts";

async function main() {
  loadEnv(); // fail fast on invalid configuration
  const config = env();
  if (config.STORAGE_DRIVER === "local") await mkdir(mediaRoot(), { recursive: true });
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close().catch(() => {});
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
