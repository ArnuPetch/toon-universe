"use server";

import { getUserId } from "@/lib/server/auth";
import { type ActionResult, fail } from "@/lib/server/errors";
import { unlockEpisode, type UnlockResult } from "@/lib/server/rpc";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Enums = Database["public"]["Enums"];
const MODES: readonly Enums["reading_mode"][] = ["vertical", "paged"];
const DIRECTIONS: readonly Enums["reading_direction"][] = ["ltr", "rtl"];

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/**
 * Unlock a paid episode with coins (30 days). The user id comes from the
 * session inside unlockEpisode(); the DB checks price, age, balance, etc.
 */
export async function unlockEpisodeAction(episodeId: number): Promise<ActionResult<UnlockResult>> {
  if (!validId(episodeId)) return fail("episode_not_found");
  return unlockEpisode(episodeId);
}

/**
 * Remember where the reader is ("continue reading", synced across devices).
 * Also moves the series onto the "reading" shelf unless it's already shelved
 * as reading/completed. Signed out → no-op.
 */
export async function saveReadingProgress(episodeId: number, page: number): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId || !validId(episodeId) || !validId(page)) return { ok: false };

  const supabase = await createClient();
  // RLS: only released episodes of visible series (or own) are returned.
  const { data: episode } = await supabase
    .from("episodes")
    .select("series_id, page_count")
    .eq("id", episodeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!episode) return { ok: false };

  const pageNumber = Math.min(page, Math.max(1, episode.page_count));
  const [progress, shelf] = await Promise.all([
    supabase.from("reading_progress").upsert(
      { user_id: userId, series_id: episode.series_id, episode_id: episodeId, page_number: pageNumber },
      { onConflict: "user_id,series_id" },
    ),
    supabase
      .from("bookshelf_entries")
      .select("status")
      .eq("user_id", userId)
      .eq("series_id", episode.series_id)
      .maybeSingle(),
  ]);
  if (progress.error) {
    console.error("[action:saveReadingProgress]", progress.error);
    return { ok: false };
  }
  if (!shelf.data || shelf.data.status === "plan_to_read") {
    await supabase
      .from("bookshelf_entries")
      .upsert({ user_id: userId, series_id: episode.series_id, status: "reading" }, { onConflict: "user_id,series_id" });
  }
  return { ok: true };
}

/** Remember the reading mode / direction for one series. Signed out → no-op. */
export async function saveReadingPreference(
  seriesId: number,
  mode: Enums["reading_mode"],
  direction: Enums["reading_direction"],
): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId || !validId(seriesId) || !MODES.includes(mode) || !DIRECTIONS.includes(direction)) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("reading_preferences")
    .upsert({ user_id: userId, series_id: seriesId, mode, direction }, { onConflict: "user_id,series_id" });
  if (error) {
    console.error("[action:saveReadingPreference]", error);
    return { ok: false };
  }
  return { ok: true };
}
