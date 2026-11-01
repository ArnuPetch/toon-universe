import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getUserId } from "./auth";
import { fail, type ActionResult } from "./errors";
import { callRpc } from "./rpc";

// Ranking, recommendations and view counting
// (supabase/migrations/*_ranking.sql, docs/database.md#ranking--recommendation).

type Enums = Database["public"]["Enums"];
export type RankingKind = Enums["ranking_kind"];
export type RankingPeriod = Enums["ranking_period"];

// The generated types mark every returned column as non-null; these don't lie.
export type RankedSeries = {
  rank: number;
  series_id: number;
  slug: string;
  title: string;
  cover_key: string | null;
  age_rating: Enums["age_rating"];
  status: Enums["series_status"];
  score: number;
  views: number;
  follows: number;
  rating_avg: number | null;
  rating_count: number;
  published_at: string | null;
  last_episode_at: string | null;
};

export type RecommendedSeries = {
  series_id: number;
  slug: string;
  title: string;
  cover_key: string | null;
  age_rating: Enums["age_rating"];
  status: Enums["series_status"];
  reason: "also_read" | "same_genre";
};

/** Set by src/proxy.ts for every visitor; identifies signed-out viewers. */
export const VIEWER_COOKIE = "tu_vid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ranked series for the current viewer (RLS + age rating applied in the DB).
 * Runs as the signed-in user, not service_role.
 */
export async function getSeriesRanking(input: {
  kind: RankingKind;
  period?: RankingPeriod;
  genreId?: number;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<RankedSeries[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_series_ranking", {
    p_kind: input.kind,
    p_period: input.period,
    p_genre_id: input.genreId,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) {
    console.error("[rpc:get_series_ranking]", error);
    return fail("unexpected_error");
  }
  return { ok: true, data: data as RankedSeries[] };
}

/** "Readers of this series also read…", topped up with same-genre series. */
export async function getSeriesRecommendations(
  seriesId: number,
  limit?: number,
): Promise<ActionResult<RecommendedSeries[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_series_recommendations", {
    p_series_id: seriesId,
    p_limit: limit,
  });
  if (error) {
    console.error("[rpc:get_series_recommendations]", error);
    return fail("unexpected_error");
  }
  return { ok: true, data: data as RecommendedSeries[] };
}

/**
 * Count a view of an episode (once per viewer per episode per Thai day).
 * Viewer = verified user id when signed in, else the anonymous cookie id.
 * Call from the server when an episode's pages are actually served.
 * Returns ok(false) when the view isn't counted (repeat, own episode, not public).
 */
export async function recordEpisodeView(episodeId: number): Promise<ActionResult<boolean>> {
  let viewerKey = await getUserId();
  if (!viewerKey) {
    const anonId = (await cookies()).get(VIEWER_COOKIE)?.value;
    if (!anonId || !UUID_RE.test(anonId)) return { ok: true, data: false };
    viewerKey = `anon:${anonId}`;
  }
  return callRpc<boolean>("record_episode_view", {
    p_episode_id: episodeId,
    p_viewer_key: viewerKey,
  });
}
