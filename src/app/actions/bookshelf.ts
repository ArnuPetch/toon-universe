"use server";

import { redirect } from "next/navigation";
import { getUserId } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Add a series to the signed-in reader's bookshelf ("plan to read").
 * Keeps the existing status if the series is already on the shelf.
 * RLS (owner all) guarantees the row belongs to the session user.
 */
export async function addToBookshelf(seriesId: number): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  if (!Number.isSafeInteger(seriesId) || seriesId <= 0) return { ok: false };

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
