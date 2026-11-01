"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Mark the signed-in user's notifications as read: the given ids, or every
 * unread one when `ids` is omitted. RLS + the user_id filter keep it to own rows.
 */
export async function markNotificationsRead(ids?: number[]): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/notifications");
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { ok: false };
    if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) return { ok: false };
  }

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (ids) query = query.in("id", ids);
  const { error } = await query;
  if (error) {
    console.error("[action:markNotificationsRead]", error);
    return { ok: false };
  }
  // Re-render the current page so the top bar's unread badge updates too.
  refresh();
  return { ok: true };
}
