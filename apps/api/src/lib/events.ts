// Transactional outbox and audit log. Both are written with the caller's transaction so they
// commit or roll back together with the business change.
import type { Db } from "../db/pool.ts";

export type DomainEventType =
  | "OrderCreated"
  | "PaymentCaptured"
  | "PaymentFailed"
  | "PaymentCapturedAfterCancellation"
  | "OrderStatusChanged"
  | "OrderCancelled"
  | "DeliveryUpdated"
  | "NotificationRetryRequested";

export async function emitEvent(
  db: Db,
  input: { tenantId: string; type: DomainEventType; aggregateType: string; aggregateId: string; payload?: Record<string, unknown> },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.tenantId, input.type, input.aggregateType, input.aggregateId, JSON.stringify(input.payload ?? {})],
  );
  return r.rows[0]!.id;
}

export interface AuditActor {
  tenantId: string;
  userId: string | null;
  requestId?: string;
}

export async function audit(
  db: Db,
  actor: AuditActor,
  eventName: string,
  entity: { type: string; id: string | null },
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (tenant_id, actor_user_id, event_name, entity_type, entity_id, request_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actor.tenantId, actor.userId, eventName, entity.type, entity.id, actor.requestId ?? null, JSON.stringify(metadata)],
  );
}
