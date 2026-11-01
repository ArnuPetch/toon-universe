"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/server/auth";
import { invalidateCatalog } from "@/lib/server/catalog-cache";
import { type ActionResult, type ErrorCode, ERROR_MESSAGES, fail, isErrorCode } from "@/lib/server/errors";
import { removeEpisode, removeSeries, requestWithdrawal } from "@/lib/server/rpc";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Uploader studio. Content is written straight to the tables as the signed-in
// user: RLS pins every row to series the user owns (and blocks suspended /
// banned accounts), DB triggers enforce the price / release rules. Anything
// that refunds coins (removing a released episode or a series) goes through
// the service_role RPCs. The user id always comes from getUserId().
//
// Every change that can alter what the public sees calls invalidateCatalog().

type Enums = Database["public"]["Enums"];

export type FormState = { error?: string; success?: string };

const AGE_RATINGS: readonly Enums["age_rating"][] = ["all", "teen", "mature"];
const SERIES_STATUSES: readonly Enums["series_status"][] = ["ongoing", "completed", "hiatus"];
const MODES: readonly Enums["reading_mode"][] = ["vertical", "paged"];
const DIRECTIONS: readonly Enums["reading_direction"][] = ["ltr", "rtl"];
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const MAX_PRICE = 1000;
const MAX_PAGES = 300;

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

function intField(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function pick<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Map a direct table write error to an app error code. */
function writeError(ctx: string, error: PostgrestError, onUnique?: ErrorCode): ErrorCode {
  if (error.code === "P0001" && isErrorCode(error.message)) return error.message;
  // RLS with-check: the only user-reachable cause is a suspended/banned account.
  if (error.code === "42501") return "account_not_active";
  if (error.code === "23505" && onUnique) return onUnique;
  if (error.code === "23514" && error.message.includes("once per month")) return "price_change_too_soon";
  if (error.code === "23514" && error.message.includes("rescheduled")) return "episode_released_locked";
  console.error(`[studio:${ctx}]`, error);
  return "unexpected_error";
}

const msg = (code: ErrorCode): FormState => ({ error: ERROR_MESSAGES[code] });

async function requireUploader(next = "/studio") {
  const userId = await getUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(next)}`);
  return userId;
}

/** Slug from an English title; Thai/other titles get a short random slug. */
function makeSlug(title: string) {
  const base = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  const suffix = crypto.randomUUID().slice(0, 6);
  return base.length >= 3 ? `${base}-${suffix}` : `series-${suffix}`;
}

// =============================================================================
// Series
// =============================================================================

/** Create (no `id`) or update a series. Create → redirect to its studio page. */
export async function saveSeries(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUploader("/studio/series/new");
  const idRaw = text(formData, "id");
  const id = idRaw ? Number(idRaw) : null;
  if (id !== null && !validId(id)) return msg("invalid_input");

  const title = text(formData, "title");
  const synopsis = text(formData, "synopsis");
  const slugInput = text(formData, "slug").toLowerCase();
  const ageRating = pick(text(formData, "age_rating"), AGE_RATINGS);
  const status = pick(text(formData, "status"), SERIES_STATUSES);
  const mode = pick(text(formData, "reading_mode"), MODES);
  const direction = pick(text(formData, "reading_direction"), DIRECTIONS);
  const genreIds = [...new Set(formData.getAll("genres").map((g) => Number(g)))];

  if ([...title].length < 1 || [...title].length > 200) return { error: "กรุณากรอกชื่อเรื่อง (ไม่เกิน 200 ตัวอักษร)" };
  if ([...synopsis].length > 5000) return { error: "เรื่องย่อยาวได้ไม่เกิน 5,000 ตัวอักษร" };
  if (slugInput && !SLUG_RE.test(slugInput)) {
    return { error: "ลิงก์เรื่องใช้ได้เฉพาะ a-z, 0-9 และ - (ไม่เกิน 100 ตัว)" };
  }
  if (!ageRating || !status || !mode || !direction) return msg("invalid_input");
  if (genreIds.length === 0) return { error: "เลือกแนวอย่างน้อย 1 แนว" };
  if (genreIds.length > 5 || !genreIds.every((g) => Number.isInteger(g) && g > 0 && g < 32768)) {
    return { error: "เลือกแนวได้ไม่เกิน 5 แนว" };
  }

  const db = await createClient();
  const fields = {
    title,
    synopsis: synopsis || null,
    age_rating: ageRating,
    status,
    default_reading_mode: mode,
    default_reading_direction: direction,
  };

  let seriesId: number;
  if (id === null) {
    const { data, error } = await db
      .from("series")
      .insert({ ...fields, uploader_id: userId, slug: slugInput || makeSlug(title), visibility: "draft" })
      .select("id")
      .single();
    if (error) return msg(writeError("createSeries", error, "slug_taken"));
    seriesId = data.id;
  } else {
    const { data, error } = await db
      .from("series")
      .update({ ...fields, ...(slugInput ? { slug: slugInput } : {}) })
      .eq("id", id)
      .eq("uploader_id", userId)
      .select("id");
    if (error) return msg(writeError("updateSeries", error, "slug_taken"));
    if (data.length === 0) return msg("series_not_found");
    seriesId = id;
    const del = await db.from("series_genres").delete().eq("series_id", seriesId);
    if (del.error) return msg(writeError("genres", del.error));
  }

  const ins = await db.from("series_genres").insert(genreIds.map((genre_id) => ({ series_id: seriesId, genre_id })));
  if (ins.error) return msg(writeError("genres", ins.error));

  if (id === null) redirect(`/studio/series/${seriesId}`);
  invalidateCatalog();
  refresh();
  return { success: "บันทึกแล้ว" };
}

/** Publish (draft → published) or move back to draft. */
export async function setSeriesVisibility(
  seriesId: number,
  visibility: Enums["series_visibility"],
): Promise<ActionResult<null>> {
  const userId = await requireUploader();
  if (!validId(seriesId) || (visibility !== "draft" && visibility !== "published")) return fail("invalid_input");
  const db = await createClient();
  const { data, error } = await db
    .from("series")
    .update({ visibility })
    .eq("id", seriesId)
    .eq("uploader_id", userId)
    .select("id");
  if (error) return fail(writeError("visibility", error));
  if (data.length === 0) return fail("series_not_found");
  invalidateCatalog();
  refresh();
  return { ok: true, data: null };
}

/** Soft-delete + refunds (remove_series). */
export async function deleteSeries(seriesId: number): Promise<ActionResult<null>> {
  await requireUploader();
  if (!validId(seriesId)) return fail("invalid_input");
  const result = await removeSeries(seriesId);
  if (!result.ok) return result;
  redirect("/studio");
}

// =============================================================================
// Seasons
// =============================================================================

export async function saveSeason(
  seriesId: number,
  seasonId: number | null,
  number: number,
  title: string,
): Promise<ActionResult<null>> {
  await requireUploader();
  const clean = title.trim();
  if (!validId(seriesId) || (seasonId !== null && !validId(seasonId)) || !validId(number) || number > 999) {
    return fail("invalid_input");
  }
  if ([...clean].length > 200) return fail("invalid_input");
  const db = await createClient();
  const { data, error } =
    seasonId === null
      ? await db.from("seasons").insert({ series_id: seriesId, number, title: clean || null }).select("id")
      : await db
          .from("seasons")
          .update({ number, title: clean || null })
          .eq("id", seasonId)
          .eq("series_id", seriesId)
          .select("id");
  if (error) return fail(writeError("season", error, "season_number_taken"));
  if (data.length === 0) return fail("series_not_found");
  invalidateCatalog();
  refresh();
  return { ok: true, data: null };
}

/** Episodes of the season stay; they just lose their season (FK set null). */
export async function deleteSeason(seriesId: number, seasonId: number): Promise<ActionResult<null>> {
  await requireUploader();
  if (!validId(seriesId) || !validId(seasonId)) return fail("invalid_input");
  const db = await createClient();
  const { error } = await db.from("seasons").delete().eq("id", seasonId).eq("series_id", seriesId);
  if (error) return fail(writeError("deleteSeason", error));
  invalidateCatalog();
  refresh();
  return { ok: true, data: null };
}

// =============================================================================
// Episodes
// =============================================================================

/** "2026-11-05T18:00" (Thai time, from <input type="datetime-local">) → Date. */
function parseBangkokLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Create (no `id`) or update an episode. publish: draft | now | schedule
 * (+ publish_at). Released episodes keep their publish time (DB trigger).
 * Create → redirect to the episode page to upload its pages.
 */
export async function saveEpisode(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUploader();
  const seriesId = intField(formData, "series_id");
  const idRaw = text(formData, "id");
  const id = idRaw ? Number(idRaw) : null;
  const number = intField(formData, "number");
  const price = intField(formData, "price");
  const seasonRaw = text(formData, "season_id");
  const seasonId = seasonRaw ? Number(seasonRaw) : null;
  const title = text(formData, "title");
  const publish = text(formData, "publish");

  if (!validId(seriesId) || (id !== null && !validId(id)) || (seasonId !== null && !validId(seasonId))) {
    return msg("invalid_input");
  }
  if (!validId(number) || number > 100_000) return { error: "เลขตอนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป" };
  if (price === null || price > MAX_PRICE) return { error: `ราคาต้องเป็นจำนวนเต็ม 0–${MAX_PRICE} coin` };
  if ([...title].length > 200) return { error: "ชื่อตอนยาวได้ไม่เกิน 200 ตัวอักษร" };

  const db = await createClient();
  const current = id
    ? await db
        .from("episodes")
        .select("id, publish_at, page_count")
        .eq("id", id)
        .eq("series_id", seriesId)
        .maybeSingle()
    : null;
  if (current?.error) return msg(writeError("loadEpisode", current.error));
  if (id && !current?.data) return msg("episode_not_found");

  const now = Date.now();
  const released = current?.data?.publish_at != null && Date.parse(current.data.publish_at) <= now;

  let publishAt: string | null | undefined; // undefined = leave as is
  if (!released) {
    if (publish === "draft") publishAt = null;
    else if (publish === "now") publishAt = new Date(now).toISOString();
    else if (publish === "schedule") {
      const at = parseBangkokLocal(text(formData, "publish_at"));
      if (!at) return { error: "กรุณาเลือกวันและเวลาเผยแพร่" };
      if (at.getTime() <= now) return { error: "เวลาเผยแพร่ต้องเป็นเวลาในอนาคต" };
      publishAt = at.toISOString();
    } else return msg("invalid_input");

    if (publishAt !== null && (current?.data?.page_count ?? 0) === 0) return msg("episode_has_no_pages");
  }

  const fields = {
    number,
    title: title || null,
    season_id: seasonId,
    price,
    ...(publishAt !== undefined ? { publish_at: publishAt } : {}),
  };

  if (id === null) {
    const { data, error } = await db
      .from("episodes")
      .insert({ ...fields, series_id: seriesId })
      .select("id")
      .single();
    if (error) return msg(writeError("createEpisode", error, "episode_number_taken"));
    redirect(`/studio/series/${seriesId}/episodes/${data.id}`);
  }

  const { data, error } = await db.from("episodes").update(fields).eq("id", id).eq("series_id", seriesId).select("id");
  if (error) return msg(writeError("updateEpisode", error, "episode_number_taken"));
  if (data.length === 0) return msg("episode_not_found");
  invalidateCatalog();
  refresh();
  return { success: "บันทึกแล้ว" };
}

/**
 * Unreleased (draft / scheduled) → deleted outright (nobody bought it).
 * Released → soft delete + refund through remove_episode.
 */
export async function deleteEpisode(seriesId: number, episodeId: number): Promise<ActionResult<null>> {
  await requireUploader();
  if (!validId(seriesId) || !validId(episodeId)) return fail("invalid_input");
  const db = await createClient();
  const { data: ep, error } = await db
    .from("episodes")
    .select("publish_at")
    .eq("id", episodeId)
    .eq("series_id", seriesId)
    .maybeSingle();
  if (error) return fail(writeError("deleteEpisode", error));
  if (!ep) return fail("episode_not_found");

  if (ep.publish_at && Date.parse(ep.publish_at) <= Date.now()) {
    const result = await removeEpisode(episodeId);
    if (!result.ok) return result;
  } else {
    const del = await db.from("episodes").delete().eq("id", episodeId).eq("series_id", seriesId);
    if (del.error) return fail(writeError("deleteEpisode", del.error));
    invalidateCatalog();
  }
  redirect(`/studio/series/${seriesId}`);
}

export type PageInput = { width: number; height: number; ext: string };

/**
 * Replace all pages of an episode with `pages` (in reading order).
 *
 * TODO(R2): images aren't stored yet — this only records page metadata with a
 * placeholder storage key. When R2 is wired up: upload each file with a
 * presigned PUT first, then save the real keys here.
 */
export async function saveEpisodePages(
  seriesId: number,
  episodeId: number,
  pages: PageInput[],
): Promise<ActionResult<{ count: number }>> {
  await requireUploader();
  if (!validId(seriesId) || !validId(episodeId) || !Array.isArray(pages)) return fail("invalid_input");
  if (pages.length === 0 || pages.length > MAX_PAGES) return fail("invalid_input");
  const valid = pages.every(
    (p) =>
      validId(p?.width) && validId(p?.height) && p.width <= 20_000 && p.height <= 60_000 &&
      typeof p.ext === "string" && /^(jpe?g|png|webp|gif|avif)$/.test(p.ext),
  );
  if (!valid) return fail("invalid_input");

  const db = await createClient();
  const { data: ep, error } = await db
    .from("episodes")
    .select("id")
    .eq("id", episodeId)
    .eq("series_id", seriesId)
    .maybeSingle();
  if (error) return fail(writeError("pages", error));
  if (!ep) return fail("episode_not_found");

  const batch = crypto.randomUUID().slice(0, 8);
  const del = await db.from("episode_pages").delete().eq("episode_id", episodeId);
  if (del.error) return fail(writeError("pages", del.error));
  const ins = await db.from("episode_pages").insert(
    pages.map((p, i) => ({
      episode_id: episodeId,
      page_number: i + 1,
      storage_key: `pending/${seriesId}/${episodeId}/${batch}/${String(i + 1).padStart(3, "0")}.${p.ext}`,
      width: p.width,
      height: p.height,
    })),
  );
  if (ins.error) return fail(writeError("pages", ins.error));
  refresh();
  return { ok: true, data: { count: pages.length } };
}

// =============================================================================
// Earnings
// =============================================================================

const PROMPTPAY_RE = /^[0-9]{10,15}$/;

export async function savePayoutAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUploader("/studio/earnings");
  const promptpayId = text(formData, "promptpay_id").replace(/[\s-]/g, "");
  const accountName = text(formData, "account_name");
  if (!PROMPTPAY_RE.test(promptpayId) || ![10, 13, 15].includes(promptpayId.length)) {
    return { error: "เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน 13 หลัก หรือ e-Wallet 15 หลัก" };
  }
  if ([...accountName].length < 1 || [...accountName].length > 100) return { error: "กรุณากรอกชื่อบัญชี" };
  if (formData.get("confirm") !== "on") return { error: "กรุณาติ๊กยืนยันว่าตรวจสอบเลขและชื่อบัญชีแล้ว" };

  const db = await createClient();
  const { error } = await db
    .from("payout_accounts")
    .upsert({ user_id: userId, promptpay_id: promptpayId, account_name: accountName }, { onConflict: "user_id" });
  if (error) return msg(writeError("payout", error));
  refresh();
  return { success: "บันทึกบัญชีรับเงินแล้ว" };
}

export async function requestWithdrawalAction(): Promise<ActionResult<{ amount: number }>> {
  await requireUploader("/studio/earnings");
  const result = await requestWithdrawal();
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: { amount: result.data.amount } };
}
