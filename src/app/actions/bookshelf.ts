"use server";

import { redirect } from "next/navigation";
import { getUserId } from "@/lib/server/auth";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type BookshelfStatus = Database["public"]["Enums"]["bookshelf_status"];
const STATUSES: readonly BookshelfStatus[] = ["reading", "completed", "plan_to_read"];

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/**
 * Add a series to the signed-in reader's bookshelf ("plan to read").
 * Keeps the existing status if the series is already on the shelf.
 * RLS (owner all) guarantees the row belongs to the session user.
 */
export async function addToBookshelf(seriesId: number): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  if (!validId(seriesId)) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookshelf_entries")
    .upsert(
      { user_id: userId, series_id: seriesId, status: "plan_to_read" },
      { onConflict: "user_id,series_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[action:addToBookshelf]", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Put a series on a shelf (status) or take it off (null). */
export async function setBookshelfStatus(
  seriesId: number,
  status: BookshelfStatus | null,
): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  if (!validId(seriesId) || (status !== null && !STATUSES.includes(status))) return { ok: false };

  const supabase = await createClient();
  const { error } =
    status === null
      ? await supabase.from("bookshelf_entries").delete().eq("user_id", userId).eq("series_id", seriesId)
      : await supabase
          .from("bookshelf_entries")
          .upsert({ user_id: userId, series_id: seriesId, status }, { onConflict: "user_id,series_id" });
  if (error) {
    console.error("[action:setBookshelfStatus]", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Follow (get new-episode notifications) or unfollow a series. */
export async function setFollowing(seriesId: number, follow: boolean): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  if (!validId(seriesId) || typeof follow !== "boolean") return { ok: false };

  const supabase = await createClient();
  const { error } = follow
    ? await supabase
        .from("series_follows")
        .upsert({ user_id: userId, series_id: seriesId }, { onConflict: "user_id,series_id", ignoreDuplicates: true })
    : await supabase.from("series_follows").delete().eq("user_id", userId).eq("series_id", seriesId);
  if (error) {
    console.error("[action:setFollowing]", error);
    return { ok: false };
  }
  return { ok: true };
}
