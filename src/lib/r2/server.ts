import "server-only";
import { AwsClient, AwsV4Signer } from "aws4fetch";

// Cloudflare R2 through its S3 API, signed with aws4fetch (fetch + WebCrypto:
// runs on Node/Vercel and Cloudflare Workers alike).
//
// - "pages" bucket is private: episode pages are only reachable through
//   short-lived signed GET URLs, handed out after the access check.
// - "public" bucket holds covers, served from NEXT_PUBLIC_R2_PUBLIC_URL.
// - Browsers upload straight to R2 with presigned PUTs (bucket CORS must
//   allow PUT from APP_URL with Content-Type + Cache-Control headers).

export type Bucket = "pages" | "public";

type Config = { accountId: string; accessKeyId: string; secretAccessKey: string; buckets: Record<Bucket, string> };

function readConfig(): Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const pages = process.env.R2_BUCKET;
  const pub = process.env.R2_PUBLIC_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !pages || !pub) return null;
  return { accountId, accessKeyId, secretAccessKey, buckets: { pages, public: pub } };
}

let cached: { config: Config; client: AwsClient } | null | undefined;

function r2() {
  if (cached === undefined) {
    const config = readConfig();
    cached = config
      ? {
          config,
          client: new AwsClient({
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            service: "s3",
            region: "auto",
            retries: 2,
          }),
        }
      : null;
    if (!cached) console.warn("[r2] not configured — set R2_* env vars (see .env.example)");
  }
  return cached;
}

export function isR2Configured() {
  return r2() !== null;
}

function requireR2() {
  const c = r2();
  if (!c) throw new R2Error("not_configured");
  return c;
}

export class R2Error extends Error {}

function objectUrl(config: Config, bucket: Bucket, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.buckets[bucket]}/${path}`;
}

/** YYYYMMDDTHHMMSSZ */
function amzDate(d: Date) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function presign(
  method: "GET" | "PUT",
  bucket: Bucket,
  key: string,
  expiresIn: number,
  headers: Record<string, string> = {},
  datetime?: Date,
) {
  const { config } = requireR2();
  const url = new URL(objectUrl(config, bucket, key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signer = new AwsV4Signer({
    method,
    url: url.toString(),
    headers,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    signQuery: true,
    // Also sign Content-Type / Content-Length, so the upload must match them.
    allHeaders: true,
    datetime: datetime ? amzDate(datetime) : undefined,
  });
  const signed = await signer.sign();
  return signed.url.toString();
}

/**
 * Presigned PUT for one object. The browser must send exactly `headers`
 * (Content-Length is set by the browser from the body and is signed too).
 */
export async function presignPut(
  bucket: Bucket,
  key: string,
  file: { contentType: string; size: number; cacheControl: string },
  expiresIn = 30 * 60,
) {
  const headers = { "content-type": file.contentType, "cache-control": file.cacheControl };
  const url = await presign("PUT", bucket, key, expiresIn, { ...headers, "content-length": String(file.size) });
  return { url, headers: { "Content-Type": file.contentType, "Cache-Control": file.cacheControl } };
}

const GET_WINDOW_MS = 60 * 60 * 1000;

/**
 * Signed GET URLs for private objects. The signing time is rounded down to the
 * hour so the same page keeps the same URL for a while (browser cache hits
 * when re-reading); every URL stays valid for at least 2 hours.
 */
export async function presignGets(keys: string[]): Promise<string[]> {
  const start = new Date(Math.floor(Date.now() / GET_WINDOW_MS) * GET_WINDOW_MS);
  return Promise.all(keys.map((key) => presign("GET", "pages", key, 3 * 60 * 60, {}, start)));
}

/**
 * Signed URLs for episode pages; null for keys that aren't real R2 objects
 * (placeholder rows from before R2) or when R2 isn't configured.
 */
export async function pageUrls(keys: string[]): Promise<(string | null)[]> {
  if (!isR2Configured()) return keys.map(() => null);
  const real = keys.filter((k) => k.startsWith("episodes/"));
  try {
    const signed = await presignGets(real);
    const byKey = new Map(real.map((k, i) => [k, signed[i]]));
    return keys.map((k) => byKey.get(k) ?? null);
  } catch (e) {
    console.error("[r2:sign]", e);
    return keys.map(() => null);
  }
}

/** Size + type of an object, or null if it doesn't exist. */
export async function headObject(bucket: Bucket, key: string) {
  const { config, client } = requireR2();
  const res = await client.fetch(objectUrl(config, bucket, key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new R2Error(`head ${res.status}`);
  return {
    size: Number(res.headers.get("content-length") ?? 0),
    contentType: res.headers.get("content-type") ?? "",
  };
}

/** Best-effort delete (missing objects are fine). Never throws. */
export async function deleteObjects(bucket: Bucket, keys: string[]) {
  const c = r2();
  if (!c || keys.length === 0) return;
  await mapLimit(keys, 8, async (key) => {
    try {
      const res = await c.client.fetch(objectUrl(c.config, bucket, key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) console.error("[r2:delete]", key, res.status);
    } catch (e) {
      console.error("[r2:delete]", key, e);
    }
  });
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
