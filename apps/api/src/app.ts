// Fastify application: one modular monolith (ADR-001) with typed, validated routes (Zod) and an
// OpenAPI document generated from the same schemas (/openapi.json, UI at /docs).
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { Redis } from "ioredis";
import { env } from "./config/env.ts";
import { pool } from "./db/pool.ts";
import { registerErrorHandler } from "./lib/errors.ts";
import { ClerkIdentityVerifier, UnconfiguredIdentityVerifier, type IdentityVerifier } from "./auth/clerk.ts";
import { mediaRoot } from "./integrations/storage.ts";
import { analyticsRoutes } from "./modules/analytics/routes.ts";
import { catalogRoutes } from "./modules/catalog/routes.ts";
import { customerRoutes } from "./modules/customers/routes.ts";
import { marketingRoutes } from "./modules/marketing/routes.ts";
import { orderRoutes } from "./modules/orders/routes.ts";
import { sessionRoutes } from "./modules/session/routes.ts";
import { settingsRoutes } from "./modules/settings/routes.ts";
import { appearanceRoutes } from "./modules/appearance/routes.ts";
import { storefrontRoutes } from "./modules/storefront/routes.ts";
import { teamRoutes } from "./modules/team/routes.ts";

export interface AppOptions {
  identityVerifier?: IdentityVerifier;
  logger?: boolean;
  rateLimit?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const config = env();
  const app = Fastify({
    logger: options.logger === false ? false : {
      level: config.LOG_LEVEL,
      redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers[\"x-razorpay-signature\"]", "*.password", "*.token", "*.secret"], remove: true },
      ...(config.NODE_ENV === "development" ? {} : {}),
    },
    // Correlate every request (docs/OBSERVABILITY.md): honour a caller's x-request-id or generate one.
    genReqId: (req) => {
      const header = req.headers["x-request-id"];
      return typeof header === "string" && /^[A-Za-z0-9._:-]{8,100}$/.test(header) ? header : randomUUID();
    },
    requestIdHeader: false,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 512 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("identityVerifier", options.identityVerifier ?? (config.CLERK_SECRET_KEY ? new ClerkIdentityVerifier(config.CLERK_SECRET_KEY, config.CLERK_AUTHORIZED_PARTIES) : new UnconfiguredIdentityVerifier()));
  app.addHook("onSend", async (request, reply) => { reply.header("x-request-id", request.id); });
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-tenant-id", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    maxAge: 600,
  });
  // Route-level limits (config.rateLimit) only apply when the plugin is registered; tests opt out.
  if (options.rateLimit !== false) {
    let redis: Redis | undefined;
    if (config.REDIS_URL) {
      redis = new Redis(config.REDIS_URL, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
      // Rate limiting degrades to "allow" (skipOnError) while Redis is unreachable; never crash the API over it.
      redis.on("error", (error) => app.log.warn({ err: error.message }, "rate-limit redis error"));
      app.addHook("onClose", async () => { redis?.disconnect(); });
    }
    await app.register(rateLimit, {
      global: false,
      ...(redis ? { redis, skipOnError: true, nameSpace: "ros-rl:" } : {}),
    });
  }
  await app.register(multipart);
  await app.register(swagger, {
    openapi: {
      info: { title: "Restaurant OS API", version: "1.0.0", description: "Money values are integer minor units (paise). Errors use { error: { code, message, details, requestId } }." },
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  if (config.STORAGE_DRIVER === "local") {
    await app.register(fastifyStatic, { root: mediaRoot(), prefix: "/media/", decorateReply: false, maxAge: "365d", immutable: true });
  }

  app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));
  app.get("/ready", { schema: { hide: true } }, async (_req, reply) => {
    try {
      await pool().query("SELECT 1");
      return { status: "ready" };
    } catch {
      return reply.status(503).send({ status: "unavailable", reason: "database" });
    }
  });

  await app.register(storefrontRoutes);
  await app.register(sessionRoutes);
  await app.register(settingsRoutes);
  await app.register(appearanceRoutes);
  await app.register(catalogRoutes);
  await app.register(marketingRoutes);
  await app.register(orderRoutes);
  await app.register(customerRoutes);
  await app.register(analyticsRoutes);
  await app.register(teamRoutes);
  return app;
}
