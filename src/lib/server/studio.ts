import "server-only";
import { pageUrls } from "@/lib/r2/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "./auth";

// Uploader studio (/studio). Personal, never cached.
// Content (series, seasons, episodes, pages, payout account, earnings, holds) is
// read as the user → RLS returns only their own rows. Counts the uploader can't
// read through RLS (followers, other people's unlocks) come from the
// service_role RPCs get_uploader_stats / get_uploader_episode_stats, always
// called with the session user's id.

type Enums = Database["public"]["Enums"];
export type SeriesVisibility = Enums["series_visibility"];
export type ModerationStatus = Enums["moderation_status"];
export type AccountStatus = Enums["account_status"];

export type SeriesStats = {
  views: number;
  views30d: number;
  followers: number;
  unlocks: number;
  unlocks30d: number;
  revenue: number;
  revenue30d: number;
};

const EMPTY_STATS: SeriesStats = {
  views: 0,
  views30d: 0,
  followers: 0,
  unlocks: 0,
  unlocks30d: 0,
  revenue: 0,
  revenue30d: 0,
};

export type Balance = {
  withdrawable: number;
  waiting: number;
  nextAvailableAt: string | null;
  processing: number;
  paid: number;
};

export type StudioSeriesRow = {
  id: number;
  slug: string;
  title: string;
  coverKey: string | null;
  visibility: SeriesVisibility;
  moderation: ModerationStatus;
  status: Enums["series_status"];
  ageRating: Enums["age_rating"];
  lastEpisodeAt: string | null;
  updatedAt: string;
  episodeCount: number;
  stats: SeriesStats;
};

export type StudioOverview = {
  accountStatus: AccountStatus;
  series: StudioSeriesRow[];
  totals: SeriesStats;
  balance: Balance;
};

async function getBalance(userId: string): Promise<Balance> {
  const { data, error } = await createAdminClient().rpc("get_uploader_balance", { p_uploader_id: userId });
  if (error) console.error("[studio:balance]", error);
  const b = (data ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
  return {
    withdrawable: n(b.withdrawable),
    waiting: n(b.waiting),
    nextAvailableAt: typeof b.next_available_at === "string" ? b.next_available_at : null,
    processing: n(b.processing),
    paid: n(b.paid),
  };
}

/** Dashboard: own series + stats + earnings. null when signed out. */
export async function getStudioOverview(): Promise<StudioOverview | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = await createClient();
  const [profile, series, stats, balance] = await Promise.all([
    db.from("profiles").select("status").eq("id", userId).single(),
    db
      .from("series")
      .select(
        "id, slug, title, cover_key, visibility, moderation_status, status, age_rating, last_episode_at, updated_at, episodes(count)",
      )
      .eq("uploader_id", userId)
      .is("deleted_at", null)
      .is("episodes.deleted_at", null)
      .order("updated_at", { ascending: false }),
    createAdminClient().rpc("get_uploader_stats", { p_uploader_id: userId }),
    getBalance(userId),
  ]);
  for (const r of [profile, series, stats]) if (r.error) console.error("[studio:overview]", r.error);

  const statsById = new Map(
    (stats.data ?? []).map((s) => [
      s.series_id,
      {
        views: s.views,
        views30d: s.views_30d,
        followers: s.followers,
        unlocks: s.unlocks,
        unlocks30d: s.unlocks_30d,
        revenue: s.revenue,
        revenue30d: s.revenue_30d,
      } satisfies SeriesStats,
    ]),
  );

  const rows: StudioSeriesRow[] = (series.data ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    coverKey: s.cover_key,
    visibility: s.visibility,
    moderation: s.moderation_status,
    status: s.status,
    ageRating: s.age_rating,
    lastEpisodeAt: s.last_episode_at,
    updatedAt: s.updated_at,
    episodeCount: s.episodes[0]?.count ?? 0,
    stats: statsById.get(s.id) ?? EMPTY_STATS,
  }));

  const totals = rows.reduce<SeriesStats>(
    (t, r) => {
      for (const k of Object.keys(t) as (keyof SeriesStats)[]) t[k] += r.stats[k];
      return t;
    },
    { ...EMPTY_STATS },
  );

  return { accountStatus: profile.data?.status ?? "active", series: rows, totals, balance };
}

// --- One series ---

export type StudioEpisode = {
  id: number;
  number: number;
  title: string | null;
  seasonId: number | null;
  price: number;
  priceChangedAt: string | null;
  publishAt: string | null;
  pageCount: number;
  /** draft = no publish_at, scheduled = in the future, released = out. */
  state: "draft" | "scheduled" | "released";
  views: number;
  unlocks: number;
};

export type StudioSeason = { id: number; number: number; title: string | null };

export type StudioSeries = {
  id: number;
  slug: string;
  title: string;
  synopsis: string | null;
  coverKey: string | null;
  ageRating: Enums["age_rating"];
  status: Enums["series_status"];
  visibility: SeriesVisibility;
  moderation: ModerationStatus;
  readingMode: Enums["reading_mode"];
  readingDirection: Enums["reading_direction"];
  publishedAt: string | null;
  genreIds: number[];
  seasons: StudioSeason[];
  episodes: StudioEpisode[];
  /** Open content review hold (series closed by an admin). */
  hold: { reason: string; startedAt: string } | null;
  stats: SeriesStats;
  now: number;
};

function episodeState(publishAt: string | null, now: number): StudioEpisode["state"] {
  if (!publishAt) return "draft";
  return Date.parse(publishAt) > now ? "scheduled" : "released";
}

/** null = signed out or not the uploader's series. */
export async function getStudioSeries(seriesId: number): Promise<StudioSeries | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = await createClient();
  const { data: s, error } = await db
    .from("series")
    .select(
      "id, slug, title, synopsis, cover_key, age_rating, status, visibility, moderation_status, default_reading_mode, default_reading_direction, published_at, series_genres(genre_id)",
    )
    .eq("id", seriesId)
    .eq("uploader_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("[studio:series]", error);
  if (!s) return null;

  const admin = createAdminClient();
  const [seasons, episodes, hold, epStats, stats] = await Promise.all([
    db.from("seasons").select("id, number, title").eq("series_id", seriesId).order("number"),
    db
      .from("episodes")
      .select("id, number, title, season_id, price, price_changed_at, publish_at, page_count")
      .eq("series_id", seriesId)
      .order("number"),
    db
      .from("content_holds")
      .select("reason, started_at")
      .eq("series_id", seriesId)
      .is("ended_at", null)
      .maybeSingle(),
    admin.rpc("get_uploader_episode_stats", { p_uploader_id: userId, p_series_id: seriesId }),
    admin.rpc("get_uploader_stats", { p_uploader_id: userId }),
  ]);
  for (const r of [seasons, episodes, hold, epStats, stats]) if (r.error) console.error("[studio:series]", r.error);

  const now = Date.now();
  const epById = new Map((epStats.data ?? []).map((e) => [e.episode_id, e]));
  const st = (stats.data ?? []).find((x) => x.series_id === seriesId);

  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    synopsis: s.synopsis,
    coverKey: s.cover_key,
    ageRating: s.age_rating,
    status: s.status,
    visibility: s.visibility,
    moderation: s.moderation_status,
    readingMode: s.default_reading_mode,
    readingDirection: s.default_reading_direction,
    publishedAt: s.published_at,
    genreIds: s.series_genres.map((g) => g.genre_id),
    seasons: seasons.data ?? [],
    episodes: (episodes.data ?? []).map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      seasonId: e.season_id,
      price: e.price,
      priceChangedAt: e.price_changed_at,
      publishAt: e.publish_at,
      pageCount: e.page_count,
      state: episodeState(e.publish_at, now),
      views: epById.get(e.id)?.views ?? 0,
      unlocks: epById.get(e.id)?.unlocks ?? 0,
    })),
    hold: hold.data ? { reason: hold.data.reason, startedAt: hold.data.started_at } : null,
    stats: st
      ? {
          views: st.views,
          views30d: st.views_30d,
          followers: st.followers,
          unlocks: st.unlocks,
          unlocks30d: st.unlocks_30d,
          revenue: st.revenue,
          revenue30d: st.revenue_30d,
        }
      : EMPTY_STATS,
    now,
  };
}

// --- One episode ---

export type StudioPage = { id: number; pageNumber: number; url: string | null; width: number | null; height: number | null };

export type StudioEpisodeDetail = {
  series: Pick<StudioSeries, "id" | "slug" | "title" | "seasons" | "moderation">;
  episode: StudioEpisode | null;
  pages: StudioPage[];
  /** Next free episode number (for a new episode). */
  nextNumber: number;
  /** Price can't change again until this time (released episodes, once a month). */
  priceLockedUntil: string | null;
  now: number;
};

const MONTH_MS = 30 * 86_400_000;

/** episodeId null = data for the "new episode" form. */
export async function getStudioEpisode(
  seriesId: number,
  episodeId: number | null,
): Promise<StudioEpisodeDetail | null> {
  const series = await getStudioSeries(seriesId);
  if (!series) return null;
  const episode = episodeId == null ? null : series.episodes.find((e) => e.id === episodeId) ?? null;
  if (episodeId != null && !episode) return null;

  let pages: StudioPage[] = [];
  if (episode) {
    const db = await createClient();
    const { data, error } = await db
      .from("episode_pages")
      .select("id, page_number, storage_key, width, height")
      .eq("episode_id", episode.id)
      .order("page_number");
    if (error) console.error("[studio:pages]", error);
    const urls = await pageUrls((data ?? []).map((p) => p.storage_key));
    pages = (data ?? []).map((p, i) => ({
      id: p.id,
      pageNumber: p.page_number,
      url: urls[i],
      width: p.width,
      height: p.height,
    }));
  }

  // Mirrors the DB trigger: after release, price changes at most once a month
  // (calendar month in SQL; 30 days here is only for the hint).
  const lockedUntil =
    episode?.state === "released" && episode.priceChangedAt
      ? Date.parse(episode.priceChangedAt) + MONTH_MS
      : null;

  return {
    series: { id: series.id, slug: series.slug, title: series.title, seasons: series.seasons, moderation: series.moderation },
    episode,
    pages,
    nextNumber: Math.max(0, ...series.episodes.map((e) => e.number)) + 1,
    priceLockedUntil: lockedUntil && lockedUntil > series.now ? new Date(lockedUntil).toISOString() : null,
    now: series.now,
  };
}

// --- Earnings ---

export type PayoutAccount = { promptpayId: string; accountName: string; updatedAt: string };

export type WithdrawalRow = {
  id: number;
  amount: number;
  status: Enums["withdrawal_status"];
  requestedAt: string;
  paidAt: string | null;
  promptpayId: string;
  transferRef: string | null;
  rejectReason: string | null;
};

export type EarningRow = {
  id: number;
  source: Enums["earning_source"];
  amount: number;
  status: Enums["earning_status"];
  createdAt: string;
  availableAt: string;
  seriesTitle: string | null;
};

export type Earnings = {
  accountStatus: AccountStatus;
  balance: Balance;
  payout: PayoutAccount | null;
  withdrawals: WithdrawalRow[];
  earnings: EarningRow[];
  now: number;
};

export async function getEarnings(): Promise<Earnings | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = await createClient();
  const [profile, payout, withdrawals, earnings, balance] = await Promise.all([
    db.from("profiles").select("status").eq("id", userId).single(),
    db.from("payout_accounts").select("promptpay_id, account_name, updated_at").eq("user_id", userId).maybeSingle(),
    db
      .from("withdrawals")
      .select("id, amount, status, requested_at, paid_at, promptpay_id, transfer_ref, reject_reason")
      .eq("uploader_id", userId)
      .order("requested_at", { ascending: false })
      .limit(20),
    db
      .from("uploader_earnings")
      .select("id, source, amount, status, created_at, available_at, series(title)")
      .eq("uploader_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    getBalance(userId),
  ]);
  for (const r of [profile, payout, withdrawals, earnings]) if (r.error) console.error("[studio:earnings]", r.error);

  return {
    accountStatus: profile.data?.status ?? "active",
    balance,
    payout: payout.data
      ? { promptpayId: payout.data.promptpay_id, accountName: payout.data.account_name, updatedAt: payout.data.updated_at }
      : null,
    withdrawals: (withdrawals.data ?? []).map((w) => ({
      id: w.id,
      amount: w.amount,
      status: w.status,
      requestedAt: w.requested_at,
      paidAt: w.paid_at,
      promptpayId: w.promptpay_id,
      transferRef: w.transfer_ref,
      rejectReason: w.reject_reason,
    })),
    earnings: (earnings.data ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      amount: e.amount,
      status: e.status,
      createdAt: e.created_at,
      availableAt: e.available_at,
      seriesTitle: e.series?.title ?? null,
    })),
    now: Date.now(),
  };
}
