import "server-only";
import { revalidateTag } from "next/cache";

// Cache tag + lifetimes for public catalog data (home page sections etc.).
// Cached entries are shared by all signed-out visitors (see src/lib/supabase/public.ts).

export const CATALOG_TAG = "catalog";

/** Ranking / trending / hero: matches the 10-minute materialized view refresh. */
export const RANKING_LIFE = { stale: 300, revalidate: 600, expire: 3600 };

/** "Recently updated": episodes are released by pg_cron, so keep this short. */
export const UPDATES_LIFE = { stale: 60, revalidate: 60, expire: 600 };

/**
 * Drop every cached catalog entry right away. Call after anything that hides
 * content from the public (remove, content hold, ban). `expire: 0` = never
 * serve the stale copy, so a taken-down series disappears on the next request.
 */
export function invalidateCatalog() {
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 });
  } catch (error) {
    // Outside a request (scripts/tests) there is no cache to invalidate.
    console.error("[cache:invalidateCatalog]", error);
  }
}
