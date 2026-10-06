// Object storage for uploaded images (docs/ARCHITECTURE.md "Files/media"). Local disk for
// development, any S3-compatible bucket (Supabase Storage, R2, S3) for deployed environments.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.ts";

export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  publicUrl(key: string): string;
}

export function mediaRoot(): string {
  const dir = env().MEDIA_DIR;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

class LocalStorage implements MediaStorage {
  async put(key: string, body: Buffer) {
    const path = join(mediaRoot(), key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  publicUrl(key: string) {
    return `${env().API_PUBLIC_URL.replace(/\/$/, "")}/media/${key}`;
  }
}

class S3Storage implements MediaStorage {
  private readonly client: S3Client;
  constructor() {
    const e = env();
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
  }
  publicUrl(key: string) {
    return `${env().S3_PUBLIC_BASE_URL!.replace(/\/$/, "")}/${key}`;
  }
}

let instance: MediaStorage | undefined;
export function storage(): MediaStorage {
  instance ??= env().STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return instance;
}

/** Detects the real image type from magic bytes; the client-declared type is not trusted. */
export function sniffImageType(buffer: Buffer): { contentType: string; ext: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: "image/png", ext: "png" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { contentType: "image/webp", ext: "webp" };
  return null;
}

export async function mediaUrlMap(db: { query: (sql: string, params: unknown[]) => Promise<{ rows: { id: string; storage_key: string }[] }> }, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))];
  if (!unique.length) return new Map();
  const r = await db.query(`SELECT id, storage_key FROM media_assets WHERE id = ANY($1::uuid[])`, [unique]);
  return new Map(r.rows.map((row) => [row.id, storage().publicUrl(row.storage_key)]));
}
