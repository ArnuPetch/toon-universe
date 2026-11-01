import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { pageUrls } from "@/lib/r2/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "./auth";
import { CATALOG_TAG, UPDATES_LIFE } from "./catalog-cache";
import type { CoverBadge, SeriesSummary } from "./home";
import { getSeriesRecommendations } from "./ranking";
import { getReviewSummary } from "./social";

// Data for the series page (/series/[slug]) and the reader (/series/[slug]/[number]).
//
// Same split as home.ts:
//   - catalog (series info, episode list, stats): cached for signed-out
//     visitors, read live as the user when signed in (an uploader also sees
//     their own non-public series this way)
//   - personal (follow, bookshelf, unlocks, progress, age check): never cached

type Db = SupabaseClient<Database>;
type Enums = Database["public"]["Enums"];

export type AgeRating = Enums["age_rating"];
export type ReadingMode = Enums["reading_mode"];
export type ReadingDirection = Enums["reading_direction"];
export type BookshelfStatus = Enums["bookshelf_status"];

export type EpisodeItem = {
  id: number;
  number: number;
  title: string | null;
  price: number;
  /** When the episode became readable (publish_at). */
  releasedAt: string;
  seasonId: number | null;
  pageCount: number;
};

export type Season = { id: number; number: number; title: string | null };

export type SeriesDetail = {
  id: number;
  slug: string;
  title: string;
  synopsis: string | null;
  coverKey: string | null;
  ageRating: AgeRating;
  status: Enums["series_status"];
  /** False for the uploader's own draft / held / removed series. */
  isPublic: boolean;
  defaultMode: ReadingMode;
  defaultDirection: ReadingDirection;
  genres: { slug: string; name: string }[];
  uploader: { id: string; name: string; verified: boolean } | null;
  stats: { views: number; follows: number; ratingAvg: number | null; ratingCount: number };
  episodes: EpisodeItem[];
  seasons: Season[];
};

async function loadSeries(db: Db, slug: string): Promise<SeriesDetail | null> {
  const { data: s, error } = await db
    .from("series")
    .select(
      "id, slug, title, synopsis, cover_key, age_rating, status, visibility, moderation_status, deleted_at, default_reading_mode, default_reading_direction, uploader_id, series_genres(genres(slug, name_th))",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error("[series:load]", error);
  if (!s || s.deleted_at) return null;

  const [uploader, stats, rating, episodes, seasons] = await Promise.all([
    db.from("profiles").select("id, display_name, username, is_verified").eq("id", s.uploader_id).maybeSingle(),
    db.rpc("get_series_stats", { p_series_id: s.id }).maybeSingle(),
    // Live (the stats MV lags ≤ 10 min) so a new review shows up right away.
    getReviewSummary({ seriesId: s.id, episodeId: null }, db),
    db
      .from("episodes")
      .select("id, number, title, price, publish_at, season_id, page_count")
      .eq("series_id", s.id)
      .is("deleted_at", null)
      .not("publish_at", "is", null)
      .lte("publish_at", new Date().toISOString())
      .order("number", { ascending: true }),
    db.from("seasons").select("id, number, title").eq("series_id", s.id).order("number"),
  ]);
  if (episodes.error) console.error("[series:episodes]", episodes.error);

  const u = uploader.data;
  const st = stats.data;
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    synopsis: s.synopsis,
    coverKey: s.cover_key,
    ageRating: s.age_rating,
    status: s.status,
    isPublic: s.visibility === "published" && s.moderation_status === "active",
    defaultMode: s.default_reading_mode,
    defaultDirection: s.default_reading_direction,
    genres: s.series_genres.flatMap((g) => (g.genres ? [{ slug: g.genres.slug, name: g.genres.name_th }] : [])),
    uploader: u ? { id: u.id, name: u.display_name || u.username || "ผู้เขียน", verified: u.is_verified } : null,
    stats: {
      views: Number(st?.views ?? 0),
      follows: Number(st?.follows ?? 0),
      ratingAvg: rating.avg,
      ratingCount: rating.count,
    },
    episodes: (episodes.data ?? []).map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      price: e.price,
      releasedAt: e.publish_at!,
      seasonId: e.season_id,
      pageCount: e.page_count,
    })),
    seasons: seasons.data ?? [],
  };
}

async function cachedSeries(slug: string) {
  "use cache";
  // Episodes go live at publish_at (no request involved), so keep this short.
  cacheLife(UPDATES_LIFE);
  cacheTag(CATALOG_TAG);
  return loadSeries(createPublicClient(), slug);
}

const SLUG_RE = /^[a-z0-9-]{1,100}$/;

/** Series + released episodes as the current viewer may see them; null = 404. */
export async function getSeries(slug: string): Promise<SeriesDetail | null> {
  if (!SLUG_RE.test(slug)) return null;
  return (await getUserId()) ? loadSeries(await createClient(), slug) : cachedSeries(slug);
}

/** Public series info only (for metadata) — never depends on the viewer. */
export async function getPublicSeriesTitle(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const s = await cachedSeries(slug);
  return s ? { title: s.title, synopsis: s.synopsis } : null;
}

// --- Personal data: never cached ---

export type ViewerState = {
  userId: string | null;
  isOwner: boolean;
  meetsAgeRating: boolean;
  following: boolean;
  bookshelf: BookshelfStatus | null;
  progress: { episodeId: number; page: number } | null;
  /** Active unlocks: episode id → expires_at. */
  unlocks: Map<number, string>;
  /** Request time, for "x days left" (components can't call Date.now()). */
  now: number;
};

/** Does the caller satisfy an age rating? (anon → only 'all') */
export async function meetsAgeRating(db: Db, rating: AgeRating) {
  if (rating === "all") return true;
  const { data, error } = await db.rpc("viewer_meets_age_rating", { p_rating: rating });
  if (error) console.error("[rpc:viewer_meets_age_rating]", error);
  return data === true;
}

export async function getViewerState(series: SeriesDetail): Promise<ViewerState> {
  const userId = await getUserId();
  if (!userId) {
    return {
      userId: null,
      isOwner: false,
      meetsAgeRating: series.ageRating === "all",
      following: false,
      bookshelf: null,
      progress: null,
      unlocks: new Map(),
      now: Date.now(),
    };
  }
  const db = await createClient();
  const [age, follow, shelf, progress, unlocks] = await Promise.all([
    meetsAgeRating(db, series.ageRating),
    db.from("series_follows").select("series_id").eq("series_id", series.id).eq("user_id", userId).maybeSingle(),
    db.from("bookshelf_entries").select("status").eq("series_id", series.id).eq("user_id", userId).maybeSingle(),
    db
      .from("reading_progress")
      .select("episode_id, page_number")
      .eq("series_id", series.id)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("episode_unlocks")
      .select("episode_id, expires_at")
      .eq("series_id", series.id)
      .eq("user_id", userId)
      .is("refunded_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const unlockMap = new Map<number, string>();
  for (const u of unlocks.data ?? []) {
    const prev = unlockMap.get(u.episode_id);
    if (!prev || prev < u.expires_at) unlockMap.set(u.episode_id, u.expires_at);
  }
  const isOwner = series.uploader?.id === userId;
  return {
    userId,
    isOwner,
    meetsAgeRating: isOwner || age,
    following: follow.data != null,
    bookshelf: shelf.data?.status ?? null,
    progress: progress.data ? { episodeId: progress.data.episode_id, page: progress.data.page_number } : null,
    unlocks: unlockMap,
    now: Date.now(),
  };
}

export type RecommendedItem = SeriesSummary & { badge?: CoverBadge };

/** "คนที่อ่านเรื่องนี้ก็อ่าน" (RLS + age rating of the viewer). */
export async function getRecommendations(seriesId: number, limit = 10): Promise<RecommendedItem[]> {
  const result = await getSeriesRecommendations(seriesId, limit);
  if (!result.ok) return [];
  return result.data.map((r) => ({
    id: r.series_id,
    slug: r.slug,
    title: r.title,
    coverKey: r.cover_key,
    genres: [],
  }));
}

// --- Reader ---

/** `url` = short-lived signed R2 URL (null → placeholder). */
export type ReaderPage = { number: number; url: string | null; width: number | null; height: number | null };

export type ReaderPreference = { mode: ReadingMode; direction: ReadingDirection };

/** Pages the viewer may read (RLS: owner / free / active unlock + age). */
export async function getEpisodePages(episodeId: number): Promise<ReaderPage[]> {
  const db = (await getUserId()) ? await createClient() : createPublicClient();
  const { data, error } = await db
    .from("episode_pages")
    .select("page_number, storage_key, width, height")
    .eq("episode_id", episodeId)
    .order("page_number");
  if (error) {
    console.error("[reader:pages]", error);
    return [];
  }
  // Signed only after RLS let these rows through.
  const urls = await pageUrls(data.map((p) => p.storage_key));
  return data.map((p, i) => ({ number: p.page_number, url: urls[i], width: p.width, height: p.height }));
}

/** The reader's saved mode/direction for this series, else the series default. */
export async function getReadingPreference(series: SeriesDetail): Promise<ReaderPreference> {
  const fallback = { mode: series.defaultMode, direction: series.defaultDirection };
  const userId = await getUserId();
  if (!userId) return fallback;
  const db = await createClient();
  const { data } = await db
    .from("reading_preferences")
    .select("mode, direction")
    .eq("series_id", series.id)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? fallback;
}
