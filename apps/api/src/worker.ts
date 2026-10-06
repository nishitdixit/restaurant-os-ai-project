// Background worker (docs/ARCHITECTURE.md "Async work"): Redis + BullMQ.
//  - relays the transactional outbox to the "events" queue;
//  - turns events into notifications and sends them with exponential-backoff retries;
//  - every minute, cancels orders whose payment window expired.
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { env, loadEnv } from "./config/env.ts";
import { closePool, pool } from "./db/pool.ts";
import { DevelopmentNotificationProvider } from "./integrations/messaging.ts";
import { materializeEvent, sendNotification, type DomainEventRow } from "./jobs/notifications.ts";
import { relayOnce } from "./jobs/relay.ts";
import { expireUnpaidOrders } from "./modules/payments/service.ts";

const QUEUES = { events: "ros-events", notifications: "ros-notifications", maintenance: "ros-maintenance" } as const;

async function main() {
  loadEnv();
  const config = env();
  const log = pino({ level: config.LOG_LEVEL, base: { service: "restaurant-os-worker" } });
  if (!config.REDIS_URL) throw new Error("REDIS_URL is required to run the worker.");
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  // ioredis reconnects by itself; without a listener a connection error would crash the worker.
  redis.on("error", (error) => log.warn({ err: error.message }, "redis connection error"));
  const connection: ConnectionOptions = redis;
  const provider = new DevelopmentNotificationProvider(config.MOCK_NOTIFICATION_MODE);

  const events = new Queue(QUEUES.events, { connection });
  const notifications = new Queue(QUEUES.notifications, { connection });
  const maintenance = new Queue(QUEUES.maintenance, { connection });
  const retention = { removeOnComplete: { count: 5000, age: 7 * 24 * 3600 }, removeOnFail: { count: 5000, age: 30 * 24 * 3600 } };

  const enqueueSend = (id: string) => notifications.add("send", { notificationId: id }, {
    jobId: `send-${id}-${Date.now()}`, attempts: config.NOTIFICATION_MAX_ATTEMPTS, backoff: { type: "exponential", delay: 5000 }, ...retention,
  });

  const eventWorker = new Worker<{ event: DomainEventRow }>(QUEUES.events, async (job) => {
    const ids = await materializeEvent(job.data.event);
    for (const id of ids) await enqueueSend(id);
    return { notifications: ids.length };
  }, { connection, concurrency: 5 });

  const notificationWorker = new Worker<{ notificationId: string }>(QUEUES.notifications, async (job) => {
    const outcome = await sendNotification(provider, job.data.notificationId);
    if (outcome === "retry") throw new Error("Transient notification failure; retrying.");
    return { outcome };
  }, { connection, concurrency: 10 });

  const maintenanceWorker = new Worker(QUEUES.maintenance, async (job) => {
    if (job.name === "expire-unpaid-orders") return { expired: await expireUnpaidOrders(config.PAYMENT_WINDOW_MINUTES) };
    return null;
  }, { connection, concurrency: 1 });
  await maintenance.upsertJobScheduler("expire-unpaid-orders", { every: 60_000 }, { name: "expire-unpaid-orders", opts: retention });

  for (const [name, worker] of Object.entries({ eventWorker, notificationWorker, maintenanceWorker })) {
    worker.on("failed", (job, error) => log.warn({ worker: name, jobId: job?.id, attemptsMade: job?.attemptsMade, err: error.message }, "job failed"));
    worker.on("error", (error) => log.error({ worker: name, err: error.message }, "worker error"));
  }

  let stopping = false;
  const publisher = { publish: async (event: DomainEventRow) => { await events.add(event.event_type, { event }, { jobId: event.id, ...retention }); } };
  const relayLoop = async () => {
    while (!stopping) {
      try {
        const n = await relayOnce(publisher);
        if (n) log.info({ published: n }, "outbox relayed");
        if (n < 100) await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        log.error({ err: (error as Error).message }, "outbox relay failed");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };
  void relayLoop();
  await pool().query("SELECT 1");
  log.info({ queues: Object.values(QUEUES) }, "worker started");

  const shutdown = async (signal: string) => {
    stopping = true;
    log.info({ signal }, "worker shutting down");
    await Promise.allSettled([eventWorker.close(), notificationWorker.close(), maintenanceWorker.close()]);
    await Promise.allSettled([events.close(), notifications.close(), maintenance.close()]);
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
