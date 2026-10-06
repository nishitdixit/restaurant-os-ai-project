// Session bootstrap and self-service restaurant creation (Journey B: "Sign in -> setup wizard").
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { CreateRestaurantSchema, type Session } from "@restaurant-os/types";
import { env } from "../../config/env.ts";
import { pool, withTransaction } from "../../db/pool.ts";
import { ApiError } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { authenticate } from "../../auth/context.ts";
import { permissionsForRole } from "../../auth/permissions.ts";
import type { Role } from "../../auth/types.ts";

const DEFAULT_HOURS = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["11:00", "23:00"]]]));

export async function sessionRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/session", { schema: { tags: ["session"] } }, async (req): Promise<Session> => {
    const identity = await authenticate(req);
    if (!identity.userId) return { user: null, memberships: [], selfSignupEnabled: env().SELF_SIGNUP_ENABLED };
    const user = await pool().query<{ id: string; email: string | null }>(`SELECT id, email FROM users WHERE id = $1`, [identity.userId]);
    const memberships = await pool().query<{ tenant_id: string; tenant_name: string; role: Role; brand_slug: string | null }>(
      `SELECT t.id AS tenant_id, t.name AS tenant_name, r.name AS role,
              (SELECT b.slug FROM brands b WHERE b.tenant_id = t.id ORDER BY b.created_at LIMIT 1) AS brand_slug
       FROM tenant_memberships tm JOIN tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE' JOIN roles r ON r.id = tm.role_id
       WHERE tm.user_id = $1 AND tm.status = 'ACTIVE' ORDER BY t.name`,
      [identity.userId],
    );
    return {
      user: user.rows[0] ? { id: user.rows[0].id, email: user.rows[0].email } : null,
      memberships: memberships.rows.map((m) => ({ tenantId: m.tenant_id, tenantName: m.tenant_name, role: m.role, permissions: [...permissionsForRole(m.role)], brandSlug: m.brand_slug })),
      selfSignupEnabled: env().SELF_SIGNUP_ENABLED,
    };
  });

  r.post("/v1/restaurants", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } }, schema: { tags: ["session"], body: CreateRestaurantSchema } }, async (req, reply) => {
    if (!env().SELF_SIGNUP_ENABLED) throw new ApiError(403, "SIGNUP_DISABLED", "New restaurants are created by invitation only.");
    const identity = await authenticate(req);
    const input = req.body;
    const taken = await pool().query(`SELECT 1 FROM brands WHERE slug = $1`, [input.brandSlug]);
    if (taken.rowCount) throw new ApiError(409, "SLUG_TAKEN", "That web address is already taken. Try another.", { fields: { brandSlug: "Already taken." } });

    const result = await withTransaction(async (tx) => {
      let userId = identity.userId;
      if (!userId) {
        const email = await app.identityVerifier.verifiedEmail(identity.externalUserId).catch(() => null);
        if (!email) throw new ApiError(422, "EMAIL_REQUIRED", "Verify your email address before creating a restaurant.");
        const existing = await tx.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
        if (existing.rowCount) {
          userId = existing.rows[0]!.id;
          await tx.query(`UPDATE users SET clerk_user_id = $2, status = 'ACTIVE', updated_at = now() WHERE id = $1`, [userId, identity.externalUserId]);
        } else {
          userId = (await tx.query<{ id: string }>(`INSERT INTO users (email, clerk_user_id) VALUES ($1, $2) RETURNING id`, [email, identity.externalUserId])).rows[0]!.id;
        }
      }
      const tenant = await tx.query<{ id: string }>(`INSERT INTO tenants (name, status, default_currency, primary_contact) VALUES ($1, 'ACTIVE', 'INR', $2) RETURNING id`,
        [input.businessName, JSON.stringify({ phone: input.phone })]);
      const tenantId = tenant.rows[0]!.id;
      const brand = await tx.query<{ id: string }>(
        `INSERT INTO brands (tenant_id, name, slug, status, metadata) VALUES ($1, $2, $3, 'DRAFT', $4) RETURNING id`,
        [tenantId, input.brandName, input.brandSlug, JSON.stringify({ primaryColor: "#b42318", links: { whatsapp: input.phone } })]);
      await tx.query(
        `INSERT INTO outlets (tenant_id, brand_id, name, phone, status, address, hours) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6)`,
        [tenantId, brand.rows[0]!.id, input.brandName, input.phone, JSON.stringify({ city: input.city }), JSON.stringify(DEFAULT_HOURS)]);
      await tx.query(`INSERT INTO tenant_memberships (tenant_id, user_id, role_id) SELECT $1, $2, id FROM roles WHERE name = 'OWNER'`, [tenantId, userId]);
      await audit(tx, { tenantId, userId, requestId: String(req.id) }, "TenantCreated", { type: "Tenant", id: tenantId }, { brandSlug: input.brandSlug });
      return { tenantId };
    });
    return reply.status(201).send(result);
  });
}
