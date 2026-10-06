// Runtime configuration, validated once at startup (docs/ARCHITECTURE.md "Configuration").
import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const csv = z.string().transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  TRUST_PROXY: bool.default(false),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  REDIS_URL: z.string().optional(),

  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_AUTHORIZED_PARTIES: csv.optional(),
  // Self-service restaurant creation is a Gate 4 capability (roadmap/RELEASE_GATES.md); off for the pilot.
  SELF_SIGNUP_ENABLED: bool.default(false),

  CORS_ORIGINS: csv.default(["http://localhost:3000", "http://localhost:3001"]),
  STOREFRONT_URL: z.url().default("http://localhost:3000"),
  ADMIN_URL: z.url().default("http://localhost:3001"),
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),

  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: bool.default(false),
  MOCK_PAYMENT_SECRET: z.string().min(16).default("restaurant-os-mock-payment-secret"),
  PAYMENT_WINDOW_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(30),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_DIR: z.string().default(".data/media"),
  MEDIA_MAX_BYTES: z.coerce.number().int().default(5 * 1024 * 1024),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),

  MOCK_NOTIFICATION_MODE: z.enum(["succeed", "fail", "flaky"]).default("succeed"),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (env.PAYMENT_PROVIDER === "mock" && !env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION) {
      throw new Error("PAYMENT_PROVIDER=mock is refused in production. Set ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true only for a supervised pilot without real payments.");
    }
    if (!env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is required in production.");
    if (env.MOCK_PAYMENT_SECRET === "restaurant-os-mock-payment-secret" && env.PAYMENT_PROVIDER === "mock") {
      throw new Error("Set a unique MOCK_PAYMENT_SECRET in production.");
    }
  }
  if (env.STORAGE_DRIVER === "s3" && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.S3_PUBLIC_BASE_URL)) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_BASE_URL.");
  }
  return env;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

export function setEnvForTests(overrides: Partial<Env>): void {
  cached = { ...loadEnv({ DATABASE_URL: "postgres://unused", ...process.env }), ...overrides };
}
