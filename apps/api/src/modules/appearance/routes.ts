// Storefront appearance (ADR-012): draft → publish workflow for the restaurant's theme, with version history.
// Publishing is blocked while the theme has readability errors (BUSINESS_RULES "Storefront themes").
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { checkTheme, normalizeTheme, type StoreTheme } from "@restaurant-os/domain";
import { PublishThemeSchema, RestoreThemeSchema, SaveThemeDraftSchema, type AppearanceState } from "@restaurant-os/types";
import { pool, withTransaction, type Db } from "../../db/pool.ts";
import { ApiError } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { iso } from "../../lib/format.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import { publishedTheme, type BrandMetadata } from "../storefront/store.ts";

const tags = ["appearance"];
const VERSION_LIMIT = 20;

interface BrandThemeRow {
  id: string;
  metadata: BrandMetadata;
  theme: unknown;
  theme_draft: unknown;
  theme_draft_updated_at: Date | null;
  theme_published_at: Date | null;
}

async function brandFor(db: Db, tenantId: string, lock = false): Promise<BrandThemeRow> {
  const r = await db.query<BrandThemeRow>(
    `SELECT id, metadata, theme, theme_draft, theme_draft_updated_at, theme_published_at FROM brands
     WHERE tenant_id = $1 ORDER BY created_at LIMIT 1${lock ? " FOR UPDATE" : ""}`, [tenantId]);
  if (!r.rowCount) throw new ApiError(404, "BRAND_NOT_FOUND", "No brand is set up for this restaurant.");
  return r.rows[0]!;
}

async function state(db: Db, tenantId: string): Promise<AppearanceState> {
  const brand = await brandFor(db, tenantId);
  const published = publishedTheme(brand);
  const draft = brand.theme_draft ? normalizeTheme(brand.theme_draft, published) : null;
  const versions = await db.query<{ id: string; theme: { presetId?: string | null }; created_at: Date; email: string | null }>(
    `SELECT v.id, v.theme, v.created_at, u.email
     FROM brand_theme_versions v LEFT JOIN users u ON u.id = v.published_by
     WHERE v.tenant_id = $1 AND v.brand_id = $2 ORDER BY v.created_at DESC LIMIT ${VERSION_LIMIT}`, [tenantId, brand.id]);
  return {
    published,
    draft,
    draftUpdatedAt: iso(brand.theme_draft_updated_at),
    publishedAt: iso(brand.theme_published_at),
    check: checkTheme(draft ?? published),
    versions: versions.rows.map((v) => ({ id: v.id, presetId: v.theme?.presetId ?? null, publishedAt: v.created_at.toISOString(), publishedBy: v.email })),
  };
}

function assertPublishable(theme: StoreTheme) {
  const { errors } = checkTheme(theme);
  if (errors.length) {
    throw new ApiError(422, "THEME_NOT_READABLE", `This theme can't be published yet: ${errors[0]!.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`, { issues: errors });
  }
}

async function publish(tx: Db, actor: ReturnType<typeof actorOf>, brand: BrandThemeRow, theme: StoreTheme, event: string, extra: Record<string, unknown> = {}) {
  assertPublishable(theme);
  await tx.query(
    `UPDATE brands SET theme = $2, theme_draft = NULL, theme_draft_updated_at = NULL, theme_published_at = now(),
       metadata = metadata || jsonb_build_object('primaryColor', $3::text), updated_at = now() WHERE id = $1`,
    [brand.id, JSON.stringify(theme), theme.colors.primary]);
  await tx.query(`INSERT INTO brand_theme_versions (tenant_id, brand_id, theme, published_by) VALUES ($1, $2, $3, $4)`,
    [actor.tenantId, brand.id, JSON.stringify(theme), actor.userId]);
  await audit(tx, actor, event, { type: "Brand", id: brand.id }, { presetId: theme.presetId, mode: theme.mode, ...extra });
}

export async function appearanceRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/appearance", { preValidation: requirePermission("tenant.read"), schema: { tags } }, async (req) => state(pool(), tenantOf(req).tenantId));

  // Drafts may still have readability problems (the editor shows them); only publishing is blocked.
  r.put("/v1/admin/appearance/draft", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: SaveThemeDraftSchema } }, async (req) => {
    const actor = actorOf(req);
    const theme = normalizeTheme(req.body.theme);
    await withTransaction(async (tx) => {
      const brand = await brandFor(tx, actor.tenantId, true);
      await tx.query(`UPDATE brands SET theme_draft = $2, theme_draft_updated_at = now() WHERE id = $1`, [brand.id, JSON.stringify(theme)]);
    });
    return state(pool(), actor.tenantId);
  });

  r.delete("/v1/admin/appearance/draft", { preValidation: requirePermission("tenant.manage"), schema: { tags } }, async (req) => {
    const actor = actorOf(req);
    await pool().query(`UPDATE brands SET theme_draft = NULL, theme_draft_updated_at = NULL WHERE tenant_id = $1`, [actor.tenantId]);
    return state(pool(), actor.tenantId);
  });

  r.post("/v1/admin/appearance/publish", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: PublishThemeSchema } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const brand = await brandFor(tx, actor.tenantId, true);
      const source = req.body.theme ?? brand.theme_draft;
      if (!source) throw new ApiError(409, "NOTHING_TO_PUBLISH", "There are no unpublished changes.");
      await publish(tx, actor, brand, normalizeTheme(source, publishedTheme(brand)), "StorefrontThemePublished");
    });
    return state(pool(), actor.tenantId);
  });

  r.post("/v1/admin/appearance/restore", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: RestoreThemeSchema } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const brand = await brandFor(tx, actor.tenantId, true);
      const version = await tx.query<{ theme: unknown }>(`SELECT theme FROM brand_theme_versions WHERE id = $1 AND tenant_id = $2 AND brand_id = $3`,
        [req.body.versionId, actor.tenantId, brand.id]);
      if (!version.rowCount) throw new ApiError(404, "THEME_VERSION_NOT_FOUND", "That version could not be found.");
      await publish(tx, actor, brand, normalizeTheme(version.rows[0]!.theme), "StorefrontThemeRestored", { versionId: req.body.versionId });
    });
    return state(pool(), actor.tenantId);
  });
}
