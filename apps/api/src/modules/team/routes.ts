// Team & roles (MVP "admin roles"), audit log viewer and outbound message log.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { InviteMemberSchema, PageQuerySchema, UpdateMemberSchema, type AuditEntry, type NotificationEntry, type TeamMember } from "@restaurant-os/types";
import { pool, withTransaction } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { audit, emitEvent } from "../../lib/events.ts";
import { decodeCursor, encodeCursor, iso } from "../../lib/format.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import type { Role } from "../../auth/types.ts";

export async function teamRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/team", { preValidation: requirePermission("tenant.read"), schema: { tags: ["team"] } }, async (req): Promise<{ items: TeamMember[] }> => {
    const t = tenantOf(req);
    const rows = await pool().query<{ membership_id: string; user_id: string; email: string | null; role: Role; status: "ACTIVE" | "DEACTIVATED"; clerk_user_id: string | null; created_at: Date }>(
      `SELECT tm.id AS membership_id, u.id AS user_id, u.email, r.name AS role, tm.status, u.clerk_user_id, tm.created_at
       FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id JOIN roles r ON r.id = tm.role_id WHERE tm.tenant_id = $1 ORDER BY tm.status, r.name, u.email`, [t.tenantId]);
    return {
      items: rows.rows.map((m) => ({
        membershipId: m.membership_id, userId: m.user_id, email: m.email, role: m.role, status: m.status, invited: !m.clerk_user_id,
        isYou: m.user_id === t.userId, createdAt: iso(m.created_at)!,
      })),
    };
  });

  r.post("/v1/admin/team", { preValidation: requirePermission("tenant.manage"), schema: { tags: ["team"], body: InviteMemberSchema } }, async (req, reply) => {
    const actor = actorOf(req);
    const email = req.body.email.trim().toLowerCase();
    const result = await withTransaction(async (tx) => {
      const user = await tx.query<{ id: string }>(
        `INSERT INTO users (email) VALUES ($1) ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO UPDATE SET updated_at = now() RETURNING id`, [email]);
      const userId = user.rows[0]!.id;
      const existing = await tx.query<{ id: string; status: string }>(`SELECT id, status FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`, [actor.tenantId, userId]);
      if (existing.rows[0]?.status === "ACTIVE") throw new ApiError(409, "ALREADY_MEMBER", `${email} is already on the team.`);
      const m = await tx.query<{ id: string }>(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role_id, status) SELECT $1, $2, id, 'ACTIVE' FROM roles WHERE name = $3
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = excluded.role_id, status = 'ACTIVE', updated_at = now() RETURNING id`,
        [actor.tenantId, userId, req.body.role]);
      await audit(tx, actor, "TeamMemberInvited", { type: "Membership", id: m.rows[0]!.id }, { email, role: req.body.role });
      return { membershipId: m.rows[0]!.id };
    });
    return reply.status(201).send(result);
  });

  r.patch("/v1/admin/team/:membershipId", {
    preValidation: requirePermission("tenant.manage"),
    schema: { tags: ["team"], params: z.object({ membershipId: z.uuid() }), body: UpdateMemberSchema },
  }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const m = await tx.query<{ user_id: string; role: Role; status: string }>(
        `SELECT tm.user_id, r.name AS role, tm.status FROM tenant_memberships tm JOIN roles r ON r.id = tm.role_id WHERE tm.id = $1 AND tm.tenant_id = $2 FOR UPDATE`,
        [req.params.membershipId, actor.tenantId]);
      const member = m.rows[0];
      if (!member) throw notFound("Team member");
      if (member.user_id === actor.userId) throw new ApiError(422, "CANNOT_CHANGE_SELF", "You can't change your own role or access.");
      const losingOwner = member.role === "OWNER" && member.status === "ACTIVE" && ((req.body.role && req.body.role !== "OWNER") || req.body.active === false);
      if (losingOwner) {
        const owners = await tx.query<{ n: number }>(
          `SELECT count(*) AS n FROM tenant_memberships tm JOIN roles r ON r.id = tm.role_id WHERE tm.tenant_id = $1 AND r.name = 'OWNER' AND tm.status = 'ACTIVE'`, [actor.tenantId]);
        if (owners.rows[0]!.n <= 1) throw new ApiError(422, "LAST_OWNER", "A restaurant needs at least one active owner.");
      }
      await tx.query(
        `UPDATE tenant_memberships SET role_id = coalesce((SELECT id FROM roles WHERE name = $3), role_id),
           status = CASE WHEN $4::boolean IS NULL THEN status WHEN $4::boolean THEN 'ACTIVE'::membership_status ELSE 'DEACTIVATED'::membership_status END, updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.membershipId, actor.tenantId, req.body.role ?? null, req.body.active ?? null]);
      await audit(tx, actor, "TeamMemberUpdated", { type: "Membership", id: req.params.membershipId }, { fromRole: member.role, toRole: req.body.role ?? member.role, active: req.body.active });
    });
    return { ok: true };
  });

  r.get("/v1/admin/audit", {
    preValidation: requirePermission("audit.read"),
    schema: { tags: ["audit"], querystring: PageQuerySchema.extend({ entityType: z.string().max(40).optional(), entityId: z.uuid().optional() }) },
  }, async (req): Promise<{ items: AuditEntry[]; nextCursor: string | null }> => {
    const { tenantId } = tenantOf(req);
    const params: unknown[] = [tenantId];
    const where = [`a.tenant_id = $1`];
    if (req.query.entityType) { params.push(req.query.entityType); where.push(`a.entity_type = $${params.length}`); }
    if (req.query.entityId) { params.push(req.query.entityId); where.push(`a.entity_id = $${params.length}`); }
    const cursor = decodeCursor(req.query.cursor);
    if (cursor) { params.push(cursor.at, cursor.id); where.push(`(a.created_at, a.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`); }
    params.push(req.query.limit + 1);
    const rows = await pool().query<{ id: string; event_name: string; entity_type: string | null; entity_id: string | null; actor: string | null; metadata: Record<string, unknown>; created_at: Date }>(
      `SELECT a.id, a.event_name, a.entity_type, a.entity_id, u.email AS actor, a.metadata, a.created_at FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE ${where.join(" AND ")} ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length}`, params);
    const page = rows.rows.slice(0, req.query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((a) => ({ id: a.id, eventName: a.event_name, entityType: a.entity_type, entityId: a.entity_id, actor: a.actor, metadata: a.metadata, createdAt: iso(a.created_at)! })),
      nextCursor: rows.rows.length > req.query.limit && last ? encodeCursor(last.created_at, last.id) : null,
    };
  });

  r.get("/v1/admin/notifications", {
    preValidation: requirePermission("order.read"),
    schema: { tags: ["notifications"], querystring: PageQuerySchema.extend({ status: z.enum(["all", "PENDING", "SENT", "FAILED"]).default("all"), orderId: z.uuid().optional() }) },
  }, async (req): Promise<{ items: NotificationEntry[]; nextCursor: string | null; failedCount: number }> => {
    const { tenantId } = tenantOf(req);
    const params: unknown[] = [tenantId];
    const where = [`n.tenant_id = $1`];
    if (req.query.status !== "all") { params.push(req.query.status); where.push(`n.status = $${params.length}::notification_status`); }
    if (req.query.orderId) { params.push(req.query.orderId); where.push(`n.order_id = $${params.length}`); }
    const cursor = decodeCursor(req.query.cursor);
    if (cursor) { params.push(cursor.at, cursor.id); where.push(`(n.created_at, n.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`); }
    params.push(req.query.limit + 1);
    const rows = await pool().query<{ id: string; audience: "CUSTOMER" | "MERCHANT"; channel: string; template: string; recipient: string; subject: string | null; body: string | null; status: NotificationEntry["status"]; attempt_count: number; last_error: string | null; order_id: string | null; order_number: number | null; created_at: Date; sent_at: Date | null }>(
      `SELECT n.id, n.audience, n.channel, n.template, n.recipient, n.subject, n.body, n.status, n.attempt_count, n.last_error, n.order_id, o.order_number, n.created_at, n.sent_at
       FROM notifications n LEFT JOIN orders o ON o.id = n.order_id WHERE ${where.join(" AND ")} ORDER BY n.created_at DESC, n.id DESC LIMIT $${params.length}`, params);
    const failed = await pool().query<{ n: number }>(`SELECT count(*) AS n FROM notifications WHERE tenant_id = $1 AND status = 'FAILED'`, [tenantId]);
    const page = rows.rows.slice(0, req.query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((n) => ({
        id: n.id, audience: n.audience, channel: n.channel, template: n.template, recipient: n.recipient, subject: n.subject, body: n.body, status: n.status,
        attemptCount: n.attempt_count, lastError: n.last_error, orderId: n.order_id, orderNumber: n.order_number, createdAt: iso(n.created_at)!, sentAt: iso(n.sent_at),
      })),
      nextCursor: rows.rows.length > req.query.limit && last ? encodeCursor(last.created_at, last.id) : null,
      failedCount: failed.rows[0]!.n,
    };
  });

  r.post("/v1/admin/notifications/:id/retry", { preValidation: requirePermission("order.manage"), schema: { tags: ["notifications"], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const n = await tx.query(`UPDATE notifications SET status = 'PENDING', last_error = NULL, updated_at = now() WHERE id = $1 AND tenant_id = $2 AND status = 'FAILED' RETURNING id`, [req.params.id, actor.tenantId]);
      if (!n.rowCount) throw new ApiError(409, "NOT_RETRYABLE", "Only failed messages can be retried.");
      // The worker picks this up from the outbox; the API never talks to the queue directly.
      await emitEvent(tx, { tenantId: actor.tenantId, type: "NotificationRetryRequested", aggregateType: "Notification", aggregateId: req.params.id });
      await audit(tx, actor, "NotificationRetried", { type: "Notification", id: req.params.id });
    });
    return { ok: true };
  });
}
