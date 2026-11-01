import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "./auth";
import { CATALOG_TAG, RANKING_LIFE, UPDATES_LIFE } from "./catalog-cache";
import { badgeFor, genresFor, type CoverBadge, type SeriesSummary } from "./home";
import type { RankedSeries, RankingKind, RankingPeriod } from "./ranking";

// Data for the browse pages: /search, /genres, /genres/[slug], /updates, /ranking.
//
// Same split as home.ts: signed out → cached copy read as anon (except free-text
// search, whose keys are unbounded user input — that is read live); signed in →
// live as the user (RLS + age rating). Filtering/sorting runs in the DB
// (search_series / get_series_ranking), never on the client.

type Db = SupabaseClient<Database>;
type Enums = Database["public"]["Enums"];
export type SeriesStatus = Enums["series_status"];

// --- Genres ---

export type Genre = { id: number; slug: string; name: string; nameEn: string };

async function loadGenres(): Promise<Genre[]> {
  const { data, error } = await createPublicClient().from("genres").select("id, slug, name_th, name_en").order("id");
  if (error) {
    console.error("[browse:genres]", error);
    return [];
  }
  return data.map((g) => ({ id: g.id, slug: g.slug, name: g.name_th, nameEn: g.name_en }));
}

/** All genres (public, same for everyone). */
export async function getGenres(): Promise<Genre[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return loadGenres();
}

const GENRE_SLUG_RE = /^[a-z0-9-]{1,50}$/;

export async function getGenre(slug: string): Promise<Genre | null> {
  if (!GENRE_SLUG_RE.test(slug)) return null;
  return (await getGenres()).find((g) => g.slug === slug) ?? null;
}

// --- Search / filter (search_series) ---

export const BROWSE_SORTS = ["relevance", "popular", "updated", "new", "rating", "title"] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];
export const PRICE_FILTERS = ["free", "paid"] as const;
export type PriceFilter = (typeof PRICE_FILTERS)[number];
export const STATUS_FILTERS = ["ongoing", "completed", "hiatus"] as const satisfies readonly SeriesStatus[];

export const PAGE_SIZE = 24;
/** search_series caps the offset; don't offer pages past it. */
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE);

export type BrowseQuery = {
  q?: string;
  genreId?: number;
  status?: SeriesStatus;
  price?: PriceFilter;
  sort?: BrowseSort;
  /** 1-based. */
  page?: number;
};

export type BrowseItem = SeriesSummary & {
  status: SeriesStatus;
  views: number;
  ratingAvg: number | null;
  latestEpisode: { number: number; releasedAt: string } | null;
  badge: CoverBadge;
};

export type BrowseResult = {
  items: BrowseItem[];
  total: number;
  page: number;
  pageCount: number;
  /** Request time, for "x ago". */
  now: number;
};

type SearchRow = Database["public"]["Functions"]["search_series"]["Returns"][number];

async function loadSearch(db: Db, query: BrowseQuery): Promise<BrowseResult> {
  const page = Math.min(Math.max(1, query.page ?? 1), MAX_PAGE);
  const { data, error } = await db.rpc("search_series", {
    p_query: query.q,
    p_genre_id: query.genreId,
    p_status: query.status,
    p_price: query.price,
    p_sort: query.sort,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const now = Date.now();
  if (error) {
    console.error("[rpc:search_series]", error);
    return { items: [], total: 0, page, pageCount: 0, now };
  }
  // Generated types mark every column non-null; the latest_* ones can be null.
  const rows = data as (Omit<SearchRow, "latest_episode_number" | "latest_episode_price" | "latest_episode_at"> & {
    latest_episode_number: number | null;
    latest_episode_price: number | null;
    latest_episode_at: string | null;
    rating_avg: number | null;
  })[];
  const genres = await genresFor(db, rows.map((r) => r.series_id));
  const total = Number(rows[0]?.total_count ?? 0);
  return {
    items: rows.map((r) => {
      const latest =
        r.latest_episode_number != null && r.latest_episode_at
          ? { price: r.latest_episode_price ?? 0, released_at: r.latest_episode_at }
          : undefined;
      return {
        id: r.series_id,
        slug: r.slug,
        title: r.title,
        coverKey: r.cover_key,
        genres: genres.get(r.series_id) ?? [],
        status: r.status,
        views: Number(r.views),
        ratingAvg: r.rating_avg == null ? null : Number(r.rating_avg),
        latestEpisode: latest ? { number: r.latest_episode_number!, releasedAt: latest.released_at } : null,
        badge: badgeFor(latest, now),
      };
    }),
    total,
    page,
    pageCount: Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGE),
    now,
  };
}

async function cachedBrowse(
  genreId: number | undefined,
  status: SeriesStatus | undefined,
  price: PriceFilter | undefined,
  sort: BrowseSort | undefined,
  page: number | undefined,
) {
  "use cache";
  cacheLife(sort === "updated" || sort === "new" ? UPDATES_LIFE : RANKING_LIFE);
  cacheTag(CATALOG_TAG);
  return loadSearch(createPublicClient(), { genreId, status, price, sort, page });
}

/** Series matching a search / filter, as the current viewer may see them. */
export async function searchSeries(query: BrowseQuery): Promise<BrowseResult> {
  const q = query.q?.trim().slice(0, 100) || undefined;
  if (await getUserId()) return loadSearch(await createClient(), { ...query, q });
  if (q) return loadSearch(createPublicClient(), { ...query, q });
  return cachedBrowse(query.genreId, query.status, query.price, query.sort, query.page);
}

// --- Ranking page (get_series_ranking) ---

export type RankingRow = SeriesSummary & {
  rank: number;
  status: SeriesStatus;
  views: number;
  follows: number;
  ratingAvg: number | null;
  ratingCount: number;
  publishedAt: string | null;
};

export const RANKING_LIMIT = 50;

async function loadRanking(db: Db, kind: RankingKind, period: RankingPeriod): Promise<RankingRow[]> {
  const { data, error } = await db.rpc("get_series_ranking", {
    p_kind: kind,
    p_period: period,
    p_limit: RANKING_LIMIT,
  });
  if (error) {
    console.error("[rpc:get_series_ranking]", error);
    return [];
  }
  const rows = data as RankedSeries[];
  const genres = await genresFor(db, rows.map((r) => r.series_id));
  return rows.map((r) => ({
    id: r.series_id,
    slug: r.slug,
    title: r.title,
    coverKey: r.cover_key,
    genres: genres.get(r.series_id) ?? [],
    rank: r.rank,
    status: r.status,
    views: Number(r.views),
    follows: Number(r.follows),
    ratingAvg: r.rating_avg == null ? null : Number(r.rating_avg),
    ratingCount: r.rating_count,
    publishedAt: r.published_at,
  }));
}

async function cachedRanking(kind: RankingKind, period: RankingPeriod) {
  "use cache";
  cacheLife(kind === "new" ? UPDATES_LIFE : RANKING_LIFE);
  cacheTag(CATALOG_TAG);
  return loadRanking(createPublicClient(), kind, period);
}

export async function getRanking(kind: RankingKind, period: RankingPeriod): Promise<RankingRow[]> {
  return (await getUserId()) ? loadRanking(await createClient(), kind, period) : cachedRanking(kind, period);
}
