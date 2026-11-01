// R2 constants + key formats shared by the browser (uploaders) and the server.
// Object keys (also enforced in the DB by *_r2_storage_keys.sql):
//   private bucket  episodes/<series>/<episode>/<batch>/<NNN>.<ext>   signed GET only
//   public bucket   covers/<series>/<uuid>.<webp|jpg>                  NEXT_PUBLIC_R2_PUBLIC_URL

export const PAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;
export type PageContentType = keyof typeof PAGE_TYPES;
export type PageExt = (typeof PAGE_TYPES)[PageContentType];

export const COVER_TYPES = { "image/webp": "webp", "image/jpeg": "jpg" } as const;
export type CoverContentType = keyof typeof COVER_TYPES;

export const MAX_PAGES = 300;
export const MAX_PAGE_BYTES = 20 * 1024 * 1024;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;

// Must be sent with the PUT exactly as signed.
export const PAGE_CACHE_CONTROL = "private, max-age=86400";
export const COVER_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const BATCH_RE = /^[a-z0-9]{12}$/;

export function pageKey(seriesId: number, episodeId: number, batch: string, index: number, ext: PageExt) {
  return `episodes/${seriesId}/${episodeId}/${batch}/${String(index + 1).padStart(3, "0")}.${ext}`;
}

export function isCoverKeyOf(seriesId: number, key: string) {
  return new RegExp(`^covers/${seriesId}/[0-9a-f-]{36}\\.(webp|jpg)$`).test(key);
}

/** Public URL of a cover, or null (no cover / R2 public URL not configured). */
export function coverUrl(key: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!key || !base) return null;
  return `${base.replace(/\/+$/, "")}/${key}`;
}
