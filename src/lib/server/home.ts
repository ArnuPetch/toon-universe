import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "./auth";
import { CATALOG_TAG, RANKING_LIFE, UPDATES_LIFE } from "./catalog-cache";
import type { RankedSeries, RankingPeriod } from "./ranking";

// Data for the home page (src/app/page.tsx).
//
// Catalog sections (hero, ranking, updated, trending) depend on who is asking
// (RLS + age rating), so:
//   - signed out → cached, shared copy read with the anonymous client
//   - signed in  → read live as the user (may include teen/mature series)
// Cached copies are tagged CATALOG_TAG and dropped by invalidateCatalog()
// whenever content is taken down. Personal data (coins, progress) is never cached.

type Db = SupabaseClient<Database>;

export type SeriesSummary = {
  id: number;
  slug: string;
  title: string;
  coverKey: string | null;
  genres: string[];
};

/** Badge shown on a cover: new episode, free, or coin price. */
export type CoverBadge = { kind: "up" } | { kind: "free" } | { kind: "coin"; price: number };

export type HeroSeries = SeriesSummary & {
  synopsis: string | null;
  ratingAvg: number | null;
  status: RankedSeries["status"];
  latestEpisode: number | null;
  firstEpisode: { number: number; free: boolean } | null;
};

export type RankingEntry = SeriesSummary & { rank: number; views: number };

export type UpdatedSeries = SeriesSummary & {
  episodeNumber: number;
  releasedAt: string;
  badge: CoverBadge;
};

export type TrendingSeries = SeriesSummary & { badge: CoverBadge };

export type ContinueReading = SeriesSummary & {
  episodeNumber: number;
  page: number;
  pageCount: number;
};

export type ViewerSummary = {
  coins: number;
  unreadNotifications: number;
} | null;

/** An episode younger than this gets the "UP" badge. */
const UP_BADGE_MS = 2 * 60 * 60 * 1000;

async function ranking(db: Db, kind: "views" | "trending" | "updated", period: RankingPeriod, limit: number) {
  const { data, error } = await db.rpc("get_series_ranking", { p_kind: kind, p_period: period, p_limit: limit });
  if (error) {
    console.error("[rpc:get_series_ranking]", error);
    return [];
  }
  // The generated types mark every column non-null; RankedSeries is accurate.
  return data as RankedSeries[];
}

/** Genre names (Thai) per series id. */
async function genresFor(db: Db, seriesIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (seriesIds.length === 0) return map;
  const { data, error } = await db
    .from("series_genres")
    .select("series_id, genres(name_th)")
    .in("series_id", seriesIds);
  if (error) {
    console.error("[home:genres]", error);
    return map;
  }
  for (const row of data) {
    if (!row.genres) continue;
    const list = map.get(row.series_id) ?? [];
    list.push(row.genres.name_th);
    map.set(row.series_id, list);
  }
  return map;
}

/** Latest released episode of each series (number, price, release time). */
async function latestEpisodes(db: Db, seriesIds: number[]) {
  const rows = await Promise.all(
    seriesIds.map(async (seriesId) => {
      const { data } = await db
        .from("episodes")
        .select("series_id, number, price, released_at")
        .eq("series_id", seriesId)
        .is("deleted_at", null)
        .not("released_at", "is", null)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    }),
  );
  return new Map(rows.filter((r) => r !== null).map((r) => [r.series_id, r]));
}

function toSummary(row: RankedSeries, genres: Map<number, string[]>): SeriesSummary {
  return {
    id: row.series_id,
    slug: row.slug,
    title: row.title,
    coverKey: row.cover_key,
    genres: genres.get(row.series_id) ?? [],
  };
}

function badgeFor(episode: { price: number; released_at: string | null } | undefined, now: number): CoverBadge {
  if (episode?.released_at && now - Date.parse(episode.released_at) < UP_BADGE_MS) return { kind: "up" };
  if (!episode || episode.price === 0) return { kind: "free" };
  return { kind: "coin", price: episode.price };
}

/** Hero carousel: the week's top trending series, topped up with most viewed. */
async function loadHero(db: Db, limit = 5): Promise<HeroSeries[]> {
  let rows = await ranking(db, "trending", "week", limit);
  if (rows.length < limit) {
    const seen = new Set(rows.map((r) => r.series_id));
    const extra = (await ranking(db, "views", "month", limit * 2)).filter((r) => !seen.has(r.series_id));
    rows = [...rows, ...extra].slice(0, limit);
  }
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.series_id);
  const [genres, latest, synopses, firsts] = await Promise.all([
    genresFor(db, ids),
    latestEpisodes(db, ids),
    db.from("series").select("id, synopsis").in("id", ids),
    db
      .from("episodes")
      .select("series_id, number, price")
      .in("series_id", ids)
      .eq("number", 1)
      .is("deleted_at", null)
      .not("released_at", "is", null),
  ]);
  const synopsisById = new Map((synopses.data ?? []).map((s) => [s.id, s.synopsis]));
  const firstById = new Map((firsts.data ?? []).map((e) => [e.series_id, e]));

  return rows.map((row) => {
    const first = firstById.get(row.series_id);
    return {
      ...toSummary(row, genres),
      synopsis: synopsisById.get(row.series_id) ?? null,
      ratingAvg: row.rating_avg,
      status: row.status,
      latestEpisode: latest.get(row.series_id)?.number ?? null,
      firstEpisode: first ? { number: first.number, free: first.price === 0 } : null,
    };
  });
}

type ViewRankings = Record<"day" | "week" | "month", RankingEntry[]>;

/** Most viewed series for each ranking tab. */
async function loadViewRankings(db: Db, limit = 10): Promise<ViewRankings> {
  const periods = ["day", "week", "month"] as const;
  const lists = await Promise.all(periods.map((p) => ranking(db, "views", p, limit)));
  const genres = await genresFor(db, [...new Set(lists.flat().map((r) => r.series_id))]);
  const toEntries = (rows: RankedSeries[]) =>
    rows.map((row) => ({ ...toSummary(row, genres), rank: row.rank, views: row.views }));
  return { day: toEntries(lists[0]), week: toEntries(lists[1]), month: toEntries(lists[2]) };
}

type RecentlyUpdated = { items: UpdatedSeries[]; now: number };

/** Series with a new episode recently, newest first, plus the time used for "x ago". */
async function loadRecentlyUpdated(db: Db, limit = 8): Promise<RecentlyUpdated> {
  const rows = await ranking(db, "updated", "week", limit);
  const ids = rows.map((r) => r.series_id);
  const [genres, latest] = await Promise.all([genresFor(db, ids), latestEpisodes(db, ids)]);
  const now = Date.now();
  const items = rows.flatMap((row) => {
    const episode = latest.get(row.series_id);
    if (!episode?.released_at) return [];
    return [
      {
        ...toSummary(row, genres),
        episodeNumber: episode.number,
        releasedAt: episode.released_at,
        badge: badgeFor(episode, now),
      },
    ];
  });
  return { items, now };
}

/** Fastest growing series this week. */
async function loadTrending(db: Db, limit = 10): Promise<TrendingSeries[]> {
  const rows = await ranking(db, "trending", "week", limit);
  const ids = rows.map((r) => r.series_id);
  const [genres, latest] = await Promise.all([genresFor(db, ids), latestEpisodes(db, ids)]);
  const now = Date.now();
  return rows.map((row) => ({
    ...toSummary(row, genres),
    badge: badgeFor(latest.get(row.series_id), now),
  }));
}

// --- Public entry points: cached for signed-out visitors, live when signed in ---

async function cachedHero() {
  "use cache";
  cacheLife(RANKING_LIFE);
  cacheTag(CATALOG_TAG);
  return loadHero(createPublicClient());
}

async function cachedViewRankings() {
  "use cache";
  cacheLife(RANKING_LIFE);
  cacheTag(CATALOG_TAG);
  return loadViewRankings(createPublicClient());
}

async function cachedRecentlyUpdated() {
  "use cache";
  cacheLife(UPDATES_LIFE);
  cacheTag(CATALOG_TAG);
  return loadRecentlyUpdated(createPublicClient());
}

async function cachedTrending() {
  "use cache";
  cacheLife(RANKING_LIFE);
  cacheTag(CATALOG_TAG);
  return loadTrending(createPublicClient());
}

export async function getHeroSeries(): Promise<HeroSeries[]> {
  return (await getUserId()) ? loadHero(await createClient()) : cachedHero();
}

export async function getViewRankings(): Promise<ViewRankings> {
  return (await getUserId()) ? loadViewRankings(await createClient()) : cachedViewRankings();
}

export async function getRecentlyUpdated(): Promise<RecentlyUpdated> {
  return (await getUserId()) ? loadRecentlyUpdated(await createClient()) : cachedRecentlyUpdated();
}

export async function getTrending(): Promise<TrendingSeries[]> {
  return (await getUserId()) ? loadTrending(await createClient()) : cachedTrending();
}

// --- Personal data: never cached ---

/** The signed-in reader's most recent reading progress (empty when signed out). */
export async function getContinueReading(limit = 8): Promise<ContinueReading[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reading_progress")
    .select("page_number, series(id, slug, title, cover_key), episodes(number, page_count)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[home:continue_reading]", error);
    return [];
  }
  return data.flatMap((row) => {
    if (!row.series || !row.episodes) return [];
    return [
      {
        id: row.series.id,
        slug: row.series.slug,
        title: row.series.title,
        coverKey: row.series.cover_key,
        genres: [],
        episodeNumber: row.episodes.number,
        page: row.page_number,
        pageCount: row.episodes.page_count,
      },
    ];
  });
}

/** Coin balance + unread notification count for the top bar; null when signed out. */
export async function getViewerSummary(): Promise<ViewerSummary> {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const [wallet, unread] = await Promise.all([
    supabase
      .from("coin_wallets")
      .select("purchased_balance, welcome_balance, welcome_expires_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);
  const w = wallet.data;
  const welcomeValid = w?.welcome_expires_at == null || Date.parse(w.welcome_expires_at) > Date.now();
  return {
    coins: (w?.purchased_balance ?? 0) + (welcomeValid ? (w?.welcome_balance ?? 0) : 0),
    unreadNotifications: unread.count ?? 0,
  };
}
