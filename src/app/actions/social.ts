"use server";

import { getUserId } from "@/lib/server/auth";
import { type ActionResult, fail } from "@/lib/server/errors";
import {
  COMMENT_SELECT,
  type CommentItem,
  loadComments,
  loadReviews,
  REVIEW_SELECT,
  type ReviewItem,
  type Target,
  toComment,
  toReview,
  writeError,
} from "@/lib/server/social";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Comments, reviews and reports. Writes go straight to the tables as the
// signed-in user: RLS pins user_id to the session, and the triggers in
// *_comments_reviews.sql enforce age rating / episode released / read-before-
// review / one-level replies / rate limit. The user id always comes from
// getUserId() — never from the client.

type ReportReason = Database["public"]["Enums"]["report_reason"];
const CONTENT_REPORT_REASONS: readonly ReportReason[] = ["spam", "abusive", "unhidden_spoiler"];

const MAX_COMMENT = 2000;
const MAX_REVIEW = 5000;

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

function validTarget(t: unknown): t is Target {
  if (!t || typeof t !== "object") return false;
  const { seriesId, episodeId } = t as Target;
  return validId(seriesId) && (episodeId === null || validId(episodeId));
}

/** Trimmed text within [min, max] chars, else null. */
function cleanText(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
}

// --- Comments ---

export async function postComment(input: {
  target: Target;
  parentId: number | null;
  body: string;
  isSpoiler: boolean;
}): Promise<ActionResult<CommentItem>> {
  const userId = await getUserId();
  if (!userId) return fail("not_authenticated");
  const body = cleanText(input?.body, 1, MAX_COMMENT);
  if (
    !validTarget(input.target) ||
    (input.parentId !== null && !validId(input.parentId)) ||
    typeof input.isSpoiler !== "boolean" ||
    !body
  ) {
    return fail("invalid_input");
  }

  const db = await createClient();
  const { data, error } = await db
    .from("comments")
    .insert({
      user_id: userId,
      series_id: input.target.seriesId,
      episode_id: input.target.episodeId,
      parent_id: input.parentId,
      body,
      is_spoiler: input.isSpoiler,
    })
    .select(COMMENT_SELECT)
    .single();
  if (error) return writeError("postComment", error);
  return { ok: true, data: toComment(data) };
}

export async function editComment(id: number, bodyRaw: string, isSpoiler: boolean): Promise<ActionResult<CommentItem>> {
  const userId = await getUserId();
  if (!userId) return fail("not_authenticated");
  const body = cleanText(bodyRaw, 1, MAX_COMMENT);
  if (!validId(id) || !body || typeof isSpoiler !== "boolean") return fail("invalid_input");

  const db = await createClient();
  const { data, error } = await db
    .from("comments")
    .update({ body, is_spoiler: isSpoiler })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select(COMMENT_SELECT)
    .maybeSingle();
  if (error) return writeError("editComment", error);
  if (!data) return fail("comment_not_found");
  return { ok: true, data: toComment(data) };
}

export async function deleteComment(id: number): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return fail("not_authenticated");
  if (!validId(id)) return fail("invalid_input");

  const db = await createClient();
  // The trigger replaces the value with the server's now().
  const { data, error } = await db
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return writeError("deleteComment", error);
  if (!data) return fail("comment_not_found");
  return { ok: true, data: null };
}

export async function loadMoreComments(target: Target, beforeId: number) {
  if (!validTarget(target) || !validId(beforeId)) return { items: [], hasMore: false };
  return loadComments(target, beforeId);
}

// --- Reviews ---

/** Create or update the user's review of the target (one per user per target). */
export async function saveReview(input: {
  target: Target;
  rating: number;
  body: string;
  isSpoiler: boolean;
}): Promise<ActionResult<ReviewItem>> {
  const userId = await getUserId();
  if (!userId) return fail("not_authenticated");
  const { target, rating, isSpoiler } = input ?? {};
  const rawBody = typeof input?.body === "string" ? input.body.trim() : null;
  if (
    !validTarget(target) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    typeof isSpoiler !== "boolean" ||
    rawBody === null ||
    rawBody.length > MAX_REVIEW
  ) {
    return fail("invalid_input");
  }
  const body = rawBody || null;
  const fields = { rating, body, is_spoiler: body ? isSpoiler : false };

  const db = await createClient();
  const update = () => {
    const q = db.from("reviews").update(fields).eq("user_id", userId).eq("series_id", target.seriesId);
    return (target.episodeId == null ? q.is("episode_id", null) : q.eq("episode_id", target.episodeId))
      .select(REVIEW_SELECT)
      .maybeSingle();
  };

  // Update first (editing is the common case once a review exists). Upsert
  // isn't possible: authenticated has no UPDATE grant on the key columns.
  let res = await update();
  if (res.error) return writeError("saveReview", res.error);
  if (!res.data) {
    const ins = await db
      .from("reviews")
      .insert({ user_id: userId, series_id: target.seriesId, episode_id: target.episodeId, ...fields })
      .select(REVIEW_SELECT)
      .single();
    if (ins.error?.code === "23505") res = await update(); // raced with another tab
    else if (ins.error) return writeError("saveReview", ins.error);
    else return { ok: true, data: toReview(ins.data) };
    if (res.error) return writeError("saveReview", res.error);
  }
  if (!res.data) return fail("review_not_found"); // e.g. hidden by a moderator (RLS blocks edits)
  return { ok: true, data: toReview(res.data) };
}

export async function deleteReview(id: number): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return fail("not_authenticated");
  if (!validId(id)) return fail("invalid_input");

  const db = await createClient();
  const { data, error } = await db.from("reviews").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) return writeError("deleteReview", error);
  if (data.length === 0) return fail("review_not_found");
  return { ok: true, data: null };
}

export async function loadMoreReviews(target: Target, beforeId: number) {
  if (!validTarget(target) || !validId(beforeId)) return { items: [], hasMore: false };
  return loadReviews(target, beforeId);
}

// --- Reports ---

export async function reportContent(input: {
  kind: "comment" | "review";
  id: number;
  reason: ReportReason;
  details: string;
}): Promise<ActionResult<null>> {
  const userId = await getUserId();
  if (!userId) return fail("not_authenticated");
  const details = typeof input?.details === "string" ? input.details.trim() : null;
  if (
    (input.kind !== "comment" && input.kind !== "review") ||
    !validId(input.id) ||
    !CONTENT_REPORT_REASONS.includes(input.reason) ||
    details === null ||
    details.length > 2000
  ) {
    return fail("invalid_input");
  }

  const db = await createClient();
  const { error } = await db.from("reports").insert({
    reporter_id: userId,
    target_type: input.kind,
    comment_id: input.kind === "comment" ? input.id : null,
    review_id: input.kind === "review" ? input.id : null,
    reason: input.reason,
    details: details || null,
  });
  if (error) return writeError("reportContent", error, "already_reported");
  return { ok: true, data: null };
}
