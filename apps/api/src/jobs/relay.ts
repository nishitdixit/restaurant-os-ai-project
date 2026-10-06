// Outbox relay: moves committed domain events to the job queue. Events are claimed with SKIP LOCKED so
// several workers can run; the BullMQ jobId is the event id, so a re-publish after a crash is a no-op.
import { withTransaction } from "../db/pool.ts";
import type { DomainEventRow } from "./notifications.ts";

export interface EventPublisher {
  publish(event: DomainEventRow): Promise<void>;
}

export async function relayOnce(publisher: EventPublisher, batchSize = 100): Promise<number> {
  return withTransaction(async (tx) => {
    const r = await tx.query<DomainEventRow>(
      `SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, payload FROM domain_events
       WHERE published_at IS NULL AND publish_attempts < 20 ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [batchSize]);
    let published = 0;
    for (const event of r.rows) {
      try {
        await publisher.publish(event);
        await tx.query(`UPDATE domain_events SET published_at = now(), publish_attempts = publish_attempts + 1 WHERE id = $1`, [event.id]);
        published++;
      } catch {
        await tx.query(`UPDATE domain_events SET publish_attempts = publish_attempts + 1 WHERE id = $1`, [event.id]);
        break; // queue unavailable: stop this batch, retry on the next tick
      }
    }
    return published;
  });
}
