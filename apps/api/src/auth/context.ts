// Request authentication and tenant authorization (docs/SECURITY.md, docs/TENANCY.md).
// Tenant context comes only from the verified identity plus a database membership; request bodies
// can never override it.
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db/pool.ts";
import { ApiError } from "../lib/errors.ts";
import { AuthenticationError, type IdentityVerifier } from "./clerk.ts";
import { permissionsForRole } from "./permissions.ts";
import type { Permission, Role, TenantContext } from "./types.ts";

export interface RequestIdentity {
  externalUserId: string;
  userId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    identity?: RequestIdentity;
    tenant?: TenantContext;
  }
  interface FastifyInstance {
    identityVerifier: IdentityVerifier;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finds the application user for an identity, linking a pending invitation by verified email. */
export async function resolveApplicationUser(verifier: IdentityVerifier, externalUserId: string): Promise<string | null> {
  const existing = await pool().query<{ id: string }>(`SELECT id FROM users WHERE clerk_user_id = $1 AND status = 'ACTIVE'`, [externalUserId]);
  if (existing.rowCount) return existing.rows[0]!.id;
  const email = await verifier.verifiedEmail(externalUserId).catch(() => null);
  if (!email) return null;
  const linked = await pool().query<{ id: string }>(
    `UPDATE users SET clerk_user_id = $1, updated_at = now()
     WHERE id = (SELECT id FROM users WHERE lower(email) = $2 AND clerk_user_id IS NULL AND status = 'ACTIVE' LIMIT 1)
     RETURNING id`,
    [externalUserId, email],
  );
  return linked.rows[0]?.id ?? null;
}

export async function authenticate(request: FastifyRequest): Promise<RequestIdentity> {
  if (request.identity) return request.identity;
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  const token = header.slice(7).trim();
  try {
    const verifier = request.server.identityVerifier;
    const { externalUserId } = await verifier.verify(token);
    const userId = await resolveApplicationUser(verifier, externalUserId);
    request.identity = { externalUserId, userId };
    return request.identity;
  } catch (error) {
    if (error instanceof AuthenticationError) throw new ApiError(401, "UNAUTHENTICATED", error.message);
    throw error;
  }
}

async function loadMembership(userId: string, tenantId: string): Promise<TenantContext | null> {
  const r = await pool().query<{ membership_id: string; role: Role }>(
    `SELECT tm.id AS membership_id, r.name AS role
     FROM tenant_memberships tm
     JOIN users u ON u.id = tm.user_id AND u.status = 'ACTIVE'
     JOIN tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
     JOIN roles r ON r.id = tm.role_id
     WHERE tm.user_id = $1 AND tm.tenant_id = $2 AND tm.status = 'ACTIVE'`,
    [userId, tenantId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const permissions = await pool().query<{ code: Permission }>(
    `SELECT p.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.name = $1`,
    [row.role],
  );
  const set = new Set<Permission>(permissions.rows.length ? permissions.rows.map((p) => p.code) : permissionsForRole(row.role));
  return { userId, tenantId, membershipId: row.membership_id, role: row.role, permissions: set };
}

/** preHandler: authenticated user with an active membership in x-tenant-id holding `permission`. */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const identity = await authenticate(request);
    if (!identity.userId) throw new ApiError(403, "NOT_PROVISIONED", "Your account is not linked to a restaurant yet.");
    const tenantId = request.headers["x-tenant-id"];
    if (typeof tenantId !== "string" || !UUID.test(tenantId)) throw new ApiError(400, "TENANT_REQUIRED", "x-tenant-id header is required.");
    const context = await loadMembership(identity.userId, tenantId);
    if (!context) throw new ApiError(403, "FORBIDDEN", "You do not have access to this restaurant.");
    if (!context.permissions.has(permission)) throw new ApiError(403, "FORBIDDEN", `Your role (${context.role}) cannot do this.`, { permission });
    request.tenant = context;
    request.log = request.log.child({ tenantId, userId: identity.userId });
  };
}

export function tenantOf(request: FastifyRequest): TenantContext {
  if (!request.tenant) throw new ApiError(500, "INTERNAL_ERROR", "Tenant context missing.");
  return request.tenant;
}

export function actorOf(request: FastifyRequest) {
  const t = tenantOf(request);
  return { tenantId: t.tenantId, userId: t.userId, requestId: String(request.id) };
}
