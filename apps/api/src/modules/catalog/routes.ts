import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AvailabilityInputSchema, CategoryInputSchema, ModifierGroupInputSchema, ProductInputSchema, ProductStatusInputSchema, ReorderSchema, type MediaAsset,
} from "@restaurant-os/types";
import { env } from "../../config/env.ts";
import { pool } from "../../db/pool.ts";
import { ApiError } from "../../lib/errors.ts";
import { audit } from "../../lib/events.ts";
import { sniffImageType, storage } from "../../integrations/storage.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import * as catalog from "./service.ts";

const Id = z.object({ id: z.uuid() });
const tags = ["catalog"];

export async function catalogRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/categories", { preValidation: requirePermission("catalog.read"), schema: { tags } }, async (req) => ({ items: await catalog.listCategories(tenantOf(req).tenantId) }));
  r.post("/v1/admin/categories", { preValidation: requirePermission("catalog.manage"), schema: { tags, body: CategoryInputSchema } }, async (req, reply) => reply.status(201).send(await catalog.createCategory(actorOf(req), req.body)));
  r.put("/v1/admin/categories/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id, body: CategoryInputSchema } }, async (req) => catalog.updateCategory(actorOf(req), req.params.id, req.body));
  r.delete("/v1/admin/categories/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id } }, async (req, reply) => { await catalog.archiveCategory(actorOf(req), req.params.id); return reply.status(204).send(); });
  r.post("/v1/admin/categories/reorder", { preValidation: requirePermission("catalog.manage"), schema: { tags, body: ReorderSchema } }, async (req) => { await catalog.reorder(actorOf(req), "categories", req.body.ids); return { ok: true }; });

  r.get("/v1/admin/products", {
    preValidation: requirePermission("catalog.read"),
    schema: { tags, querystring: z.object({ q: z.string().max(80).optional(), categoryId: z.uuid().optional(), status: z.enum(["all", "DRAFT", "ACTIVE", "ARCHIVED"]).optional(), availability: z.enum(["available", "unavailable"]).optional() }) },
  }, async (req) => ({ items: await catalog.listProducts(tenantOf(req).tenantId, req.query) }));
  r.get("/v1/admin/products/:id", { preValidation: requirePermission("catalog.read"), schema: { tags, params: Id } }, async (req) => catalog.getProduct(tenantOf(req).tenantId, req.params.id));
  r.post("/v1/admin/products", { preValidation: requirePermission("catalog.manage"), schema: { tags, body: ProductInputSchema } }, async (req, reply) => reply.status(201).send(await catalog.createProduct(actorOf(req), req.body)));
  r.put("/v1/admin/products/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id, body: ProductInputSchema } }, async (req) => catalog.updateProduct(actorOf(req), req.params.id, req.body));
  r.post("/v1/admin/products/:id/duplicate", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id } }, async (req, reply) => reply.status(201).send(await catalog.duplicateProduct(actorOf(req), req.params.id)));
  r.post("/v1/admin/products/status", { preValidation: requirePermission("catalog.manage"), schema: { tags, body: ProductStatusInputSchema } }, async (req) => catalog.setProductStatus(actorOf(req), req.body.productIds, req.body.status));
  r.post("/v1/admin/products/availability", { preValidation: requirePermission("availability.manage"), schema: { tags, body: AvailabilityInputSchema } }, async (req) => catalog.setAvailability(actorOf(req), req.body));
  r.post("/v1/admin/products/reorder", { preValidation: requirePermission("catalog.manage"), schema: { tags, body: ReorderSchema } }, async (req) => { await catalog.reorder(actorOf(req), "products", req.body.ids); return { ok: true }; });

  r.get("/v1/admin/modifier-groups", { preValidation: requirePermission("catalog.read"), schema: { tags } }, async (req) => ({ items: await catalog.listModifierGroups(tenantOf(req).tenantId) }));
  r.post("/v1/admin/modifier-groups", { preValidation: requirePermission("catalog.manage"), schema: { tags, body: ModifierGroupInputSchema } }, async (req, reply) => reply.status(201).send(await catalog.saveModifierGroup(actorOf(req), null, req.body)));
  r.put("/v1/admin/modifier-groups/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id, body: ModifierGroupInputSchema } }, async (req) => catalog.saveModifierGroup(actorOf(req), req.params.id, req.body));
  r.delete("/v1/admin/modifier-groups/:id", { preValidation: requirePermission("catalog.manage"), schema: { tags, params: Id } }, async (req, reply) => { await catalog.archiveModifierGroup(actorOf(req), req.params.id); return reply.status(204).send(); });

  // Image upload: type sniffed from bytes, size-limited, stored outside the app filesystem in production.
  r.post("/v1/admin/media", { preValidation: requirePermission("catalog.manage"), schema: { tags: ["media"] } }, async (req, reply): Promise<MediaAsset> => {
    const file = await req.file({ limits: { fileSize: env().MEDIA_MAX_BYTES, files: 1 } });
    if (!file) throw new ApiError(400, "FILE_REQUIRED", "Choose an image to upload.");
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw new ApiError(413, "FILE_TOO_LARGE", `Images must be smaller than ${Math.round(env().MEDIA_MAX_BYTES / 1024 / 1024)} MB.`);
    const type = sniffImageType(buffer);
    if (!type) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload a JPEG, PNG or WebP image.");
    const actor = actorOf(req);
    const key = `${actor.tenantId}/${randomUUID()}.${type.ext}`;
    await storage().put(key, buffer, type.contentType);
    const row = await pool().query<{ id: string }>(
      `INSERT INTO media_assets (tenant_id, storage_key, content_type, byte_size, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [actor.tenantId, key, type.contentType, buffer.length, actor.userId]);
    await audit(pool(), actor, "MediaUploaded", { type: "MediaAsset", id: row.rows[0]!.id }, { contentType: type.contentType, byteSize: buffer.length });
    return reply.status(201).send({ id: row.rows[0]!.id, url: storage().publicUrl(key), contentType: type.contentType, byteSize: buffer.length });
  });
}
