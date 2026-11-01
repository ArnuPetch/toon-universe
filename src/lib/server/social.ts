import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "./auth";
import { type ActionResult, type ErrorCode, fail, isErrorCode } from "./errors";

// Comments + reviews of a series (episodeId null) or an episode.
//
// Read as the viewer (RLS: hidden / deleted / banned authors are filtered out,
// except the viewer's own rows) and never cached: the lists change with every
// post and include per-viewer flags (isOwn, own hidden rows).

type Db = SupabaseClient<Database>;

export type Target = { seriesId: number; episodeId: number | null };

export const COMMENTS_PAGE = 20;
export const REVIEWS_PAGE = 10;

export type Author = { name: string; verified: boolean };

export type CommentItem = {
  id: number;
  parentId: number | null;
  body: string;
  isSpoiler: boolean;
  createdAt: string;
  edited: boolean;
  author: Author;
  authorId: string;
  /** Hidden by a moderator — only its author still sees it. */
  hidden: boolean;
  replies: CommentItem[];
};

export type ReviewItem = {
  id: number;
  rating: number;
  body: string | null;
  isSpoiler: boolean;
  createdAt: string;
  edited: boolean;
  author: Author;
  authorId: string;
  hidden: boolean;
};

export type ReviewSummary = {
  avg: number | null;
  count: number;
  /** [1★ … 5★] */
  stars: number[];
};

export const COMMENT_SELECT =
  "id, parent_id, user_id, body, is_spoiler, created_at, updated_at, hidden_at, profiles(display_name, username, is_verified)";
export const REVIEW_SELECT =
  "id, user_id, rating, body, is_spoiler, created_at, updated_at, hidden_at, profiles(display_name, username, is_verified)";

type ProfileRow = { display_name: string | null; username: string | null; is_verified: boolean } | null;

function toAuthor(p: ProfileRow): Author {
  return { name: p?.display_name || (p?.username ? `@${p.username}` : "ผู้อ่าน"), verified: p?.is_verified ?? false };
}

// Edits within a minute of posting don't count as "edited".
function wasEdited(created: string, updated: string) {
  return Date.parse(updated) - Date.parse(created) > 60_000;
}

type CommentRow = {
  id: number;
  parent_id: number | null;
  user_id: string;
  body: string;
  is_spoiler: boolean;
  created_at: string;
  updated_at: string;
  hidden_at: string | null;
  profiles: ProfileRow;
};

export function toComment(r: CommentRow): CommentItem {
  return {
    id: r.id,
    parentId: r.parent_id,
    body: r.body,
    isSpoiler: r.is_spoiler,
    createdAt: r.created_at,
    edited: wasEdited(r.created_at, r.updated_at),
    author: toAuthor(r.profiles),
    authorId: r.user_id,
    hidden: r.hidden_at != null,
    replies: [],
  };
}

type ReviewRow = Omit<CommentRow, "parent_id" | "body"> & { rating: number; body: string | null };

export function toReview(r: ReviewRow): ReviewItem {
  return {
    id: r.id,
    rating: r.rating,
    body: r.body,
    isSpoiler: r.is_spoiler,
    createdAt: r.created_at,
    edited: wasEdited(r.created_at, r.updated_at),
    author: toAuthor(r.profiles),
    authorId: r.user_id,
    hidden: r.hidden_at != null,
  };
}

/** Map a PostgREST error from a direct table write to an ActionResult. */
export function writeError(ctx: string, error: PostgrestError, onConflict?: ErrorCode): ActionResult<never> {
  if (error.code === "P0001" && isErrorCode(error.message)) return fail(error.message);
  // RLS with-check failed: the only user-reachable cause is a suspended/banned account.
  if (error.code === "42501") return fail("account_not_active");
  if (error.code === "23505" && onConflict) return fail(onConflict);
  console.error(`[social:${ctx}]`, error);
  return fail("unexpected_error");
}

async function viewerDb(): Promise<{ db: Db; userId: string | null }> {
  const userId = await getUserId();
  return { db: userId ? await createClient() : createPublicClient(), userId };
}

/** PostgREST filter for the target's episode_id ("is null" for series-level). */
function episodeFilter(t: Target): [string, string, string] {
  return t.episodeId == null ? ["episode_id", "is", "null"] : ["episode_id", "eq", String(t.episodeId)];
}

// --- Comments ---

/** Newest top-level comments (before `beforeId`), each with all its replies (oldest first). */
export async function loadComments(
  t: Target,
  beforeId?: number,
): Promise<{ items: CommentItem[]; hasMore: boolean }> {
  const { db } = await viewerDb();
  let q = db.from("comments").select(COMMENT_SELECT).eq("series_id", t.seriesId).filter(...episodeFilter(t))
    .is("parent_id", null)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(COMMENTS_PAGE + 1);
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) {
    console.error("[social:comments]", error);
    return { items: [], hasMore: false };
  }
  const items = data.slice(0, COMMENTS_PAGE).map(toComment);
  if (items.length > 0) {
    const { data: replies, error: rErr } = await db
      .from("comments")
      .select(COMMENT_SELECT)
      .in(
        "parent_id",
        items.map((c) => c.id),
      )
      .is("deleted_at", null)
      .order("id")
      .limit(1000);
    if (rErr) console.error("[social:replies]", rErr);
    const byParent = new Map(items.map((c) => [c.id, c]));
    for (const r of replies ?? []) byParent.get(r.parent_id!)?.replies.push(toComment(r));
  }
  return { items, hasMore: data.length > COMMENTS_PAGE };
}

/** Visible comments + replies on the target (for the tab label). */
export async function countComments(t: Target): Promise<number> {
  const { db } = await viewerDb();
  const { count, error } = await db
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("series_id", t.seriesId)
    .filter(...episodeFilter(t))
    .is("deleted_at", null);
  if (error) console.error("[social:countComments]", error);
  return count ?? 0;
}

// --- Reviews ---

export async function getReviewSummary(t: Target, db?: Db): Promise<ReviewSummary> {
  db ??= (await viewerDb()).db;
  const { data, error } = await db
    .rpc("get_review_summary", { p_series_id: t.seriesId, p_episode_id: t.episodeId ?? undefined })
    .maybeSingle();
  if (error) console.error("[rpc:get_review_summary]", error);
  return {
    avg: data?.rating_avg ?? null,
    count: data?.rating_count ?? 0,
    stars: data?.star_counts ?? [0, 0, 0, 0, 0],
  };
}

/** Newest written reviews (rating-only ones count in the summary but aren't listed). */
export async function loadReviews(
  t: Target,
  beforeId?: number,
): Promise<{ items: ReviewItem[]; hasMore: boolean }> {
  const { db, userId } = await viewerDb();
  let q = db.from("reviews").select(REVIEW_SELECT).eq("series_id", t.seriesId).filter(...episodeFilter(t))
    .not("body", "is", null)
    .order("id", { ascending: false })
    .limit(REVIEWS_PAGE + 1);
  if (userId) q = q.neq("user_id", userId); // shown separately as "my review"
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) {
    console.error("[social:reviews]", error);
    return { items: [], hasMore: false };
  }
  return { items: data.slice(0, REVIEWS_PAGE).map(toReview), hasMore: data.length > REVIEWS_PAGE };
}

export async function getMyReview(t: Target): Promise<ReviewItem | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = await createClient();
  const { data, error } = await db.from("reviews").select(REVIEW_SELECT).eq("series_id", t.seriesId).filter(...episodeFilter(t))
    .eq("user_id", userId)
    .maybeSingle();
  if (error) console.error("[social:myReview]", error);
  return data ? toReview(data) : null;
}
