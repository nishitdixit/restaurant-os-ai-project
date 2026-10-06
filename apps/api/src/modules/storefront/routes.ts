import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { MockPaymentCompleteSchema, PlaceOrderInputSchema, QuoteInputSchema } from "@restaurant-os/types";
import { ApiError, notFound } from "../../lib/errors.ts";
import { placeOrder, publicOrder, orderByToken, quote } from "../checkout/service.ts";
import { completeMockPayment, handlePaymentWebhook, startPayment, verifyPayment } from "../payments/service.ts";
import { menu, offers, product, search, sitemapEntries, storeConfig } from "./catalog.ts";

const Store = z.object({ store: z.string().regex(/^[a-z0-9-]{1,80}$/) });
// ?preview=1 lets a merchant see an unpublished storefront; draft products stay hidden either way.
const Preview = z.object({ preview: z.enum(["1"]).optional() });
const tags = ["storefront"];
// Public, abuse-prone endpoints are rate-limited per client IP (docs/SECURITY.md).
const limit = (max: number) => ({ rateLimit: { max, timeWindow: "1 minute" } });

export async function storefrontRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/storefront/:store/config", { schema: { tags, params: Store, querystring: z.object({ preview: z.enum(["1"]).optional(), theme: z.enum(["draft"]).optional() }) } }, async (req) => {
    return storeConfig(req.params.store, { allowDraft: req.query.preview === "1", draftTheme: req.query.theme === "draft" });
  });

  r.get("/v1/storefront/:store/menu", { schema: { tags, params: Store, querystring: Preview } }, async (req) => menu(req.params.store, req.query.preview === "1"));

  r.get("/v1/storefront/:store/products/:slug", { schema: { tags, params: Store.extend({ slug: z.string().max(80) }), querystring: Preview } }, async (req) => {
    const p = await product(req.params.store, req.params.slug, req.query.preview === "1");
    if (!p) throw notFound("Product", "PRODUCT_NOT_FOUND");
    return p;
  });

  r.get("/v1/storefront/:store/search", { config: limit(120), schema: { tags, params: Store, querystring: Preview.extend({ q: z.string().max(80).default("") }) } }, async (req) => {
    return { items: await search(req.params.store, req.query.q, req.query.preview === "1") };
  });

  r.get("/v1/storefront/:store/offers", { schema: { tags, params: Store, querystring: Preview } }, async (req) => ({ items: await offers(req.params.store, req.query.preview === "1") }));

  r.get("/v1/storefront/:store/sitemap", { schema: { tags, params: Store } }, async (req) => sitemapEntries(req.params.store));

  r.post("/v1/storefront/:store/checkout/quote", { config: limit(90), schema: { tags, params: Store, body: QuoteInputSchema } }, async (req) => {
    return quote(req.params.store, req.body);
  });

  r.post("/v1/storefront/:store/orders", {
    config: limit(15),
    schema: { tags, params: Store, body: PlaceOrderInputSchema, headers: z.object({ "idempotency-key": z.string().min(8).max(120) }).loose() },
  }, async (req, reply) => {
    const result = await placeOrder(req.params.store, req.body, req.headers["idempotency-key"]);
    return reply.status(result.duplicate ? 200 : 201).send(result);
  });

  r.get("/v1/storefront/:store/orders/:token", { config: limit(240), schema: { tags, params: Store.extend({ token: z.string().max(64) }) } }, async (req, reply) => {
    reply.header("cache-control", "no-store");
    return publicOrder(req.params.store, req.params.token);
  });

  r.post("/v1/storefront/:store/orders/:token/payments", { config: limit(20), schema: { tags, params: Store.extend({ token: z.string().max(64) }) } }, async (req) => {
    const { store, order } = await orderByToken(req.params.store, req.params.token);
    return startPayment(store.tenantId, order.id);
  });

  r.post("/v1/storefront/:store/orders/:token/payments/verify", {
    config: limit(20),
    schema: { tags, params: Store.extend({ token: z.string().max(64) }), body: z.object({ providerPaymentId: z.string().max(120), providerOrderId: z.string().max(120).optional(), signature: z.string().max(300).optional() }) },
  }, async (req) => {
    const { store, order } = await orderByToken(req.params.store, req.params.token);
    return { status: await verifyPayment(store.tenantId, order.id, req.body) };
  });

  r.post("/v1/storefront/:store/orders/:token/payments/mock-complete", {
    config: limit(20),
    schema: { tags, params: Store.extend({ token: z.string().max(64) }), body: MockPaymentCompleteSchema },
  }, async (req) => {
    const { store, order } = await orderByToken(req.params.store, req.params.token);
    const status = await completeMockPayment(store.tenantId, order.id, req.body.outcome);
    return { status, order: await publicOrder(req.params.store, req.params.token) };
  });

  // Webhooks need the exact raw body for signature verification, so they get their own parser.
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    scope.post("/v1/payments/webhook", { config: limit(600), schema: { tags: ["payments"] } }, async (req) => {
      const signature = req.headers["x-razorpay-signature"] ?? req.headers["x-mock-signature"];
      if (typeof signature !== "string" || typeof req.body !== "string") throw new ApiError(400, "INVALID_WEBHOOK", "Missing signature or body.");
      return handlePaymentWebhook(req.body, signature);
    });
  });
}
