// Storefront appearance: the restaurant's theme (ADR-012) and brand experience — homepage composition, content,
// site and menu settings (ADR-013). Edits are saved as a private draft; publishing makes the theme and the
// experience live together and records them as one version, so a restore never pairs a look with a layout it
// wasn't designed with. Publishing is blocked while text would be unreadable or photos lack alt text.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  checkExperience, checkTheme, experienceMediaIds, filterExperienceReferences, normalizeExperience, normalizeTheme,
  type StoreExperience, type StoreTheme,
} from "@restaurant-os/domain";
import { PublishThemeSchema, RestoreThemeSchema, SaveThemeDraftSchema, type AppearanceState } from "@restaurant-os/types";
import { pool, withTransaction, type Db } from "../../db/pool.ts";
import { ApiError } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { iso } from "../../lib/format.ts";
import { issuePreviewToken } from "../../lib/preview.ts";
import { mediaRefMap } from "../../integrations/storage.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import { publishedExperience, publishedTheme, type BrandMetadata } from "../storefront/store.ts";

const tags = ["appearance"];
const VERSION_LIMIT = 20;

interface BrandRow {
  id: string;
  slug: string;
  metadata: BrandMetadata;
  theme: unknown;
  theme_draft: unknown;
  experience: unknown;
  experience_draft: unknown;
  theme_draft_updated_at: Date | null;
  theme_published_at: Date | null;
}

async function brandFor(db: Db, tenantId: string, lock = false): Promise<BrandRow> {
  const r = await db.query<BrandRow>(
    `SELECT id, slug, metadata, theme, theme_draft, experience, experience_draft, theme_draft_updated_at, theme_published_at FROM brands
     WHERE tenant_id = $1 ORDER BY created_at LIMIT 1${lock ? " FOR UPDATE" : ""}`, [tenantId]);
  if (!r.rowCount) throw new ApiError(404, "BRAND_NOT_FOUND", "No brand is set up for this restaurant.");
  return r.rows[0]!;
}

/** Keeps only references to this restaurant's own media, dishes and categories (ids from elsewhere are dropped). */
async function ownReferences(db: Db, tenantId: string, experience: StoreExperience): Promise<StoreExperience> {
  const productIds = experience.sections.flatMap((s) => (s.type === "featured" || s.type === "combos" ? s.productIds : []));
  const categoryIds = experience.sections.flatMap((s) => (s.type === "categories" ? s.categoryIds : []));
  const mediaIds = experienceMediaIds(experience);
  const [media, products, categories] = await Promise.all([
    mediaIds.length ? db.query<{ id: string }>(`SELECT id FROM media_assets WHERE tenant_id = $1 AND id = ANY($2::uuid[])`, [tenantId, mediaIds]) : { rows: [] },
    productIds.length ? db.query<{ id: string }>(`SELECT id FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status <> 'ARCHIVED'`, [tenantId, productIds]) : { rows: [] },
    categoryIds.length ? db.query<{ id: string }>(`SELECT id FROM categories WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status <> 'ARCHIVED'`, [tenantId, categoryIds]) : { rows: [] },
  ]);
  return filterExperienceReferences(experience, {
    media: new Set(media.rows.map((r) => r.id)), products: new Set(products.rows.map((r) => r.id)), categories: new Set(categories.rows.map((r) => r.id)),
  });
}

async function experienceCheck(db: Db, tenantId: string, experience: StoreExperience) {
  const refs = await mediaRefMap(db, tenantId, experienceMediaIds(experience));
  return checkExperience(experience, { altText: (id) => refs.get(id)?.alt });
}

async function state(db: Db, tenantId: string): Promise<AppearanceState> {
  const brand = await brandFor(db, tenantId);
  const published = publishedTheme(brand);
  const draft = brand.theme_draft ? normalizeTheme(brand.theme_draft, published) : null;
  const liveExperience = publishedExperience(brand);
  const draftExperience = brand.experience_draft ? normalizeExperience(brand.experience_draft, liveExperience) : null;
  const editing = draftExperience ?? liveExperience;
  const [versions, media, check] = await Promise.all([
    db.query<{ id: string; theme: { presetId?: string | null }; created_at: Date; email: string | null }>(
      `SELECT v.id, v.theme, v.created_at, u.email
       FROM brand_theme_versions v LEFT JOIN users u ON u.id = v.published_by
       WHERE v.tenant_id = $1 AND v.brand_id = $2 ORDER BY v.created_at DESC LIMIT ${VERSION_LIMIT}`, [tenantId, brand.id]),
    mediaRefMap(db, tenantId, [...experienceMediaIds(liveExperience), ...(draftExperience ? experienceMediaIds(draftExperience) : [])]),
    experienceCheck(db, tenantId, editing),
  ]);
  return {
    published,
    draft,
    draftUpdatedAt: iso(brand.theme_draft_updated_at),
    publishedAt: iso(brand.theme_published_at),
    check: checkTheme(draft ?? published),
    experience: { published: liveExperience, draft: draftExperience, check },
    media: Object.fromEntries(media),
    versions: versions.rows.map((v) => ({ id: v.id, presetId: v.theme?.presetId ?? null, publishedAt: v.created_at.toISOString(), publishedBy: v.email })),
  };
}

function assertReadable(theme: StoreTheme) {
  const { errors } = checkTheme(theme);
  if (errors.length) {
    throw new ApiError(422, "THEME_NOT_READABLE", `This theme can't be published yet: ${errors[0]!.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`, { issues: errors });
  }
}

async function assertExperienceReady(db: Db, tenantId: string, experience: StoreExperience) {
  const { errors } = await experienceCheck(db, tenantId, experience);
  if (errors.length) {
    throw new ApiError(422, "EXPERIENCE_NOT_READY", `This layout can't be published yet: ${errors[0]!.message}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`, { issues: errors });
  }
}

async function publish(tx: Db, actor: ReturnType<typeof actorOf>, brand: BrandRow, theme: StoreTheme, experience: StoreExperience, event: string, extra: Record<string, unknown> = {}) {
  assertReadable(theme);
  await assertExperienceReady(tx, actor.tenantId, experience);
  await tx.query(
    `UPDATE brands SET theme = $2, theme_draft = NULL, theme_draft_updated_at = NULL, theme_published_at = now(), experience = $4, experience_draft = NULL,
       metadata = metadata || jsonb_build_object('primaryColor', $3::text), updated_at = now() WHERE id = $1`,
    [brand.id, JSON.stringify(theme), theme.colors.primary, JSON.stringify(experience)]);
  await tx.query(`INSERT INTO brand_theme_versions (tenant_id, brand_id, theme, experience, published_by) VALUES ($1, $2, $3, $4, $5)`,
    [actor.tenantId, brand.id, JSON.stringify(theme), JSON.stringify(experience), actor.userId]);
  await audit(tx, actor, event, { type: "Brand", id: brand.id }, {
    presetId: theme.presetId, mode: theme.mode, layoutPresetId: experience.layoutPresetId, sections: experience.sections.filter((s) => s.enabled).map((s) => s.type), ...extra,
  });
}

export async function appearanceRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/appearance", { preValidation: requirePermission("tenant.read"), schema: { tags } }, async (req) => state(pool(), tenantOf(req).tenantId));

  // Drafts may still have problems (the editor shows them); only publishing is blocked. A save may carry the theme,
  // the experience or both; the other part of the draft is left as it is.
  r.put("/v1/admin/appearance/draft", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: SaveThemeDraftSchema } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const brand = await brandFor(tx, actor.tenantId, true);
      if (req.body.theme) {
        await tx.query(`UPDATE brands SET theme_draft = $2, theme_draft_updated_at = now() WHERE id = $1`, [brand.id, JSON.stringify(normalizeTheme(req.body.theme))]);
      }
      if (req.body.experience) {
        const experience = await ownReferences(tx, actor.tenantId, normalizeExperience(req.body.experience, publishedExperience(brand)));
        await tx.query(`UPDATE brands SET experience_draft = $2, theme_draft_updated_at = now() WHERE id = $1`, [brand.id, JSON.stringify(experience)]);
      }
    });
    return state(pool(), actor.tenantId);
  });

  r.delete("/v1/admin/appearance/draft", { preValidation: requirePermission("tenant.manage"), schema: { tags } }, async (req) => {
    const actor = actorOf(req);
    await pool().query(`UPDATE brands SET theme_draft = NULL, experience_draft = NULL, theme_draft_updated_at = NULL WHERE tenant_id = $1`, [actor.tenantId]);
    return state(pool(), actor.tenantId);
  });

  r.post("/v1/admin/appearance/publish", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: PublishThemeSchema } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const brand = await brandFor(tx, actor.tenantId, true);
      const themeSource = req.body.theme ?? brand.theme_draft;
      const experienceSource = req.body.experience ?? brand.experience_draft;
      if (!themeSource && !experienceSource) throw new ApiError(409, "NOTHING_TO_PUBLISH", "There are no unpublished changes.");
      const liveTheme = publishedTheme(brand);
      const liveExperience = publishedExperience(brand);
      const theme = themeSource ? normalizeTheme(themeSource, liveTheme) : liveTheme;
      const experience = experienceSource ? await ownReferences(tx, actor.tenantId, normalizeExperience(experienceSource, liveExperience)) : liveExperience;
      await publish(tx, actor, brand, theme, experience, "StorefrontThemePublished");
    });
    return state(pool(), actor.tenantId);
  });

  r.post("/v1/admin/appearance/restore", { preValidation: requirePermission("tenant.manage"), schema: { tags, body: RestoreThemeSchema } }, async (req) => {
    const actor = actorOf(req);
    await withTransaction(async (tx) => {
      const brand = await brandFor(tx, actor.tenantId, true);
      const version = await tx.query<{ theme: unknown; experience: unknown }>(`SELECT theme, experience FROM brand_theme_versions WHERE id = $1 AND tenant_id = $2 AND brand_id = $3`,
        [req.body.versionId, actor.tenantId, brand.id]);
      if (!version.rowCount) throw new ApiError(404, "THEME_VERSION_NOT_FOUND", "That version could not be found.");
      const v = version.rows[0]!;
      // Versions published before layouts existed only restore the look; the current layout stays.
      const experience = v.experience ? await ownReferences(tx, actor.tenantId, normalizeExperience(v.experience)) : publishedExperience(brand);
      await publish(tx, actor, brand, normalizeTheme(v.theme), experience, "StorefrontThemeRestored", { versionId: req.body.versionId });
    });
    return state(pool(), actor.tenantId);
  });

  // Signed, short-lived link for staff to see the unpublished store and the draft look (lib/preview.ts).
  r.post("/v1/admin/preview-token", { preValidation: requirePermission("tenant.read"), schema: { tags } }, async (req) => {
    const brand = await brandFor(pool(), tenantOf(req).tenantId);
    return { ...issuePreviewToken(brand.slug), brandSlug: brand.slug };
  });
}

