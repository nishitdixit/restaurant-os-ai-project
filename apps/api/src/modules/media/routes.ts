// Media library (ADR-013): every photo a restaurant uploads — logo, banners, dishes, categories, story and gallery
// photos — with alt text for screen readers. A photo can only be deleted once nothing uses it.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { experienceMediaIds, normalizeExperience, SECTION_LABELS } from "@restaurant-os/domain";
import { MediaListQuerySchema, MediaUpdateSchema, type MediaAsset, type MediaKind } from "@restaurant-os/types";
import { pool, withTransaction, type Db } from "../../db/pool.ts";
import { ApiError, notFound } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { storage } from "../../integrations/storage.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";

const Id = z.object({ id: z.uuid() });
const tags = ["media"];

/** Where each of the restaurant's photos is used, by media id. */
export async function mediaUsage(db: Db, tenantId: string): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>();
  const add = (id: string | null | undefined, where: string) => {
    if (!id) return;
    const key = id.toLowerCase();
    const list = usage.get(key) ?? [];
    if (!list.includes(where)) list.push(where);
    usage.set(key, list);
  };
  const [brands, products, gallery, categories] = await Promise.all([
    db.query<{ logo_asset_id: string | null; experience: unknown; experience_draft: unknown }>(`SELECT logo_asset_id, experience, experience_draft FROM brands WHERE tenant_id = $1`, [tenantId]),
    db.query<{ image_asset_id: string | null; name: string }>(`SELECT image_asset_id, name FROM products WHERE tenant_id = $1 AND status <> 'ARCHIVED' AND image_asset_id IS NOT NULL`, [tenantId]),
    db.query<{ media_id: string; name: string }>(`SELECT pm.media_id, p.name FROM product_media pm JOIN products p ON p.id = pm.product_id WHERE pm.tenant_id = $1 AND p.status <> 'ARCHIVED'`, [tenantId]),
    db.query<{ image_asset_id: string | null; name: string }>(`SELECT image_asset_id, name FROM categories WHERE tenant_id = $1 AND status <> 'ARCHIVED' AND image_asset_id IS NOT NULL`, [tenantId]),
  ]);
  for (const b of brands.rows) {
    add(b.logo_asset_id, "Logo");
    for (const [raw, label] of [[b.experience, ""], [b.experience_draft, " (draft)"]] as const) {
      if (!raw) continue;
      const e = normalizeExperience(raw);
      if (e.seo.shareImageId) add(e.seo.shareImageId, `Share image${label}`);
      for (const s of e.sections) {
        const ids = experienceMediaIds({ ...e, seo: { ...e.seo, shareImageId: null }, sections: [s] });
        for (const id of ids) add(id, `${SECTION_LABELS[s.type]}${label}`);
      }
    }
  }
  for (const p of products.rows) add(p.image_asset_id, `Dish: ${p.name}`);
  for (const g of gallery.rows) add(g.media_id, `Dish photos: ${g.name}`);
  for (const c of categories.rows) add(c.image_asset_id, `Category: ${c.name}`);
  return usage;
}

interface Row { id: string; storage_key: string; content_type: string; byte_size: number; alt_text: string; kind: MediaKind; created_at: Date }

function toAsset(row: Row, usage: Map<string, string[]>): MediaAsset {
  return {
    id: row.id, url: storage().publicUrl(row.storage_key), contentType: row.content_type, byteSize: Number(row.byte_size),
    altText: row.alt_text, kind: row.kind, createdAt: row.created_at.toISOString(), usedIn: usage.get(row.id) ?? [],
  };
}

export async function mediaRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/media", { preValidation: requirePermission("catalog.read"), schema: { tags, querystring: MediaListQuerySchema } }, async (req) => {
    const { tenantId } = tenantOf(req);
    const rows = await pool().query<Row>(
      `SELECT id, storage_key, content_type, byte_size, alt_text, kind, created_at FROM media_assets
       WHERE tenant_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY created_at DESC LIMIT $3`, [tenantId, req.query.kind ?? null, req.query.limit]);
    const usage = await mediaUsage(pool(), tenantId);
    return { items: rows.rows.map((row) => toAsset(row, usage)) };
  });

  r.patch("/v1/admin/media/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id, body: MediaUpdateSchema } }, async (req) => {
    const actor = actorOf(req);
    const row = await withTransaction(async (tx) => {
      const updated = await tx.query<Row>(
        `UPDATE media_assets SET alt_text = coalesce($3, alt_text), kind = coalesce($4, kind), updated_at = now() WHERE id = $1 AND tenant_id = $2
         RETURNING id, storage_key, content_type, byte_size, alt_text, kind, created_at`, [req.params.id, actor.tenantId, req.body.altText ?? null, req.body.kind ?? null]);
      if (!updated.rowCount) throw notFound("Photo", "MEDIA_NOT_FOUND");
      await audit(tx, actor, "MediaUpdated", { type: "MediaAsset", id: req.params.id }, { altTextChanged: req.body.altText !== undefined, kind: req.body.kind ?? null });
      return updated.rows[0]!;
    });
    return toAsset(row, await mediaUsage(pool(), actor.tenantId));
  });

  r.delete("/v1/admin/media/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id } }, async (req, reply) => {
    const actor = actorOf(req);
    const key = await withTransaction(async (tx) => {
      const row = await tx.query<{ storage_key: string }>(`SELECT storage_key FROM media_assets WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [req.params.id, actor.tenantId]);
      if (!row.rowCount) throw notFound("Photo", "MEDIA_NOT_FOUND");
      const usedIn = (await mediaUsage(tx, actor.tenantId)).get(req.params.id.toLowerCase()) ?? [];
      if (usedIn.length) throw new ApiError(409, "MEDIA_IN_USE", `This photo is still used in: ${usedIn.join(", ")}. Remove it there first.`, { usedIn });
      await tx.query(`DELETE FROM media_assets WHERE id = $1 AND tenant_id = $2`, [req.params.id, actor.tenantId]);
      await audit(tx, actor, "MediaDeleted", { type: "MediaAsset", id: req.params.id });
      return row.rows[0]!.storage_key;
    });
    await storage().remove(key).catch((error: unknown) => req.log.warn({ err: error, key }, "media file not removed"));
    return reply.status(204).send();
  });
}
