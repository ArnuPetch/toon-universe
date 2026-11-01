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
import {
  BATCH_RE,
  COVER_CACHE_CONTROL,
  COVER_TYPES,
  type CoverContentType,
  isCoverKeyOf,
  MAX_COVER_BYTES,
  MAX_PAGE_BYTES,
  MAX_PAGES,
  PAGE_CACHE_CONTROL,
  PAGE_TYPES,
  type PageContentType,
  pageKey,
} from "@/lib/r2/shared";
import { deleteObjects, headObject, isR2Configured, mapLimit, presignPut } from "@/lib/r2/server";

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
    // Unreleased → nobody can have read it: drop its images from R2 too.
    const pages = await db.from("episode_pages").select("storage_key").eq("episode_id", episodeId);
    if (pages.error) return fail(writeError("deleteEpisode", pages.error));
    const del = await db.from("episodes").delete().eq("id", episodeId).eq("series_id", seriesId);
    if (del.error) return fail(writeError("deleteEpisode", del.error));
    await deleteObjects("pages", pages.data.map((p) => p.storage_key).filter((k) => k.startsWith("episodes/")));
    invalidateCatalog();
  }
  redirect(`/studio/series/${seriesId}`);
}

// =============================================================================
// Pages + cover (R2)
// =============================================================================
//
// Browser uploads go straight to R2 with presigned PUTs:
//   1. prepare*Upload  → checks ownership, picks the object keys, signs PUTs
//   2. browser PUTs the files
//   3. save*           → rebuilds the keys from (series, episode, batch) — the
//                        client never sends a key — HEADs every object, then
//                        writes the rows and deletes the replaced objects.
// The DB also rejects keys outside the series/episode prefix
// (*_r2_storage_keys.sql), since uploaders can write these tables directly.

/** The user's own episode (or series when episodeId is null), else null. */
async function ownsEpisode(userId: string, seriesId: number, episodeId: number | null) {
  const db = await createClient();
  const series = await db.from("series").select("id").eq("id", seriesId).eq("uploader_id", userId).maybeSingle();
  if (series.error) throw series.error;
  if (!series.data) return false;
  if (episodeId === null) return true;
  const ep = await db.from("episodes").select("id").eq("id", episodeId).eq("series_id", seriesId).maybeSingle();
  if (ep.error) throw ep.error;
  return ep.data !== null;
}

export type PageFile = { contentType: string; size: number };
export type PresignedPut = { url: string; headers: Record<string, string> };

/** Step 1 of saving pages: presigned PUTs for `files` (in reading order). */
export async function prepareEpisodePagesUpload(
  seriesId: number,
  episodeId: number,
  files: PageFile[],
): Promise<ActionResult<{ batch: string; uploads: PresignedPut[] }>> {
  const userId = await requireUploader();
  if (!validId(seriesId) || !validId(episodeId) || !Array.isArray(files)) return fail("invalid_input");
  if (files.length === 0 || files.length > MAX_PAGES) return fail("invalid_input");
  if (!files.every((f) => typeof f?.contentType === "string" && Object.hasOwn(PAGE_TYPES, f.contentType) && validId(f.size))) {
    return fail("invalid_input");
  }
  if (files.some((f) => f.size > MAX_PAGE_BYTES)) return fail("upload_too_large");
  if (!isR2Configured()) return fail("storage_unavailable");

  try {
    if (!(await ownsEpisode(userId, seriesId, episodeId))) return fail("episode_not_found");
    const batch = randomBatch();
    const uploads = await Promise.all(
      files.map((f, i) =>
        presignPut("pages", pageKey(seriesId, episodeId, batch, i, PAGE_TYPES[f.contentType as PageContentType]), {
          contentType: f.contentType,
          size: f.size,
          cacheControl: PAGE_CACHE_CONTROL,
        }),
      ),
    );
    return { ok: true, data: { batch, uploads } };
  } catch (e) {
    console.error("[studio:preparePages]", e);
    return fail("storage_unavailable");
  }
}

function randomBatch() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export type PageInput = { contentType: string; width: number; height: number };

/**
 * Step 2: replace all pages of an episode with the uploaded `batch` (pages in
 * the same order as prepareEpisodePagesUpload). Every object must exist in R2.
 */
export async function saveEpisodePages(
  seriesId: number,
  episodeId: number,
  batch: string,
  pages: PageInput[],
): Promise<ActionResult<{ count: number }>> {
  const userId = await requireUploader();
  if (!validId(seriesId) || !validId(episodeId) || typeof batch !== "string" || !BATCH_RE.test(batch)) {
    return fail("invalid_input");
  }
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PAGES) return fail("invalid_input");
  const valid = pages.every(
    (p) =>
      validId(p?.width) && validId(p?.height) && p.width <= 20_000 && p.height <= 60_000 &&
      typeof p.contentType === "string" && Object.hasOwn(PAGE_TYPES, p.contentType),
  );
  if (!valid) return fail("invalid_input");
  if (!isR2Configured()) return fail("storage_unavailable");

  const keys = pages.map((p, i) => pageKey(seriesId, episodeId, batch, i, PAGE_TYPES[p.contentType as PageContentType]));
  try {
    if (!(await ownsEpisode(userId, seriesId, episodeId))) return fail("episode_not_found");
    const heads = await mapLimit(keys, 8, (k) => headObject("pages", k));
    if (heads.some((h) => h === null)) return fail("upload_incomplete");
    if (heads.some((h) => h!.size > MAX_PAGE_BYTES || !h!.contentType.startsWith("image/"))) {
      await deleteObjects("pages", keys);
      return fail("upload_too_large");
    }
  } catch (e) {
    console.error("[studio:verifyPages]", e);
    return fail("storage_unavailable");
  }

  const db = await createClient();
  const old = await db.from("episode_pages").select("storage_key").eq("episode_id", episodeId);
  if (old.error) return fail(writeError("pages", old.error));

  const del = await db.from("episode_pages").delete().eq("episode_id", episodeId);
  if (del.error) return fail(writeError("pages", del.error));
  const ins = await db.from("episode_pages").insert(
    pages.map((p, i) => ({
      episode_id: episodeId,
      page_number: i + 1,
      storage_key: keys[i],
      width: p.width,
      height: p.height,
    })),
  );
  if (ins.error) {
    // Nothing references the new batch; the old rows are gone but their
    // objects are still there — the uploader can simply save again.
    await deleteObjects("pages", keys);
    return fail(writeError("pages", ins.error));
  }
  await deleteObjects(
    "pages",
    old.data.map((r) => r.storage_key).filter((k) => k.startsWith("episodes/") && !keys.includes(k)),
  );
  refresh();
  return { ok: true, data: { count: pages.length } };
}

/** Presigned PUT for a new cover (already resized to webp/jpg in the browser). */
export async function prepareCoverUpload(
  seriesId: number,
  file: PageFile,
): Promise<ActionResult<{ key: string; upload: PresignedPut }>> {
  const userId = await requireUploader();
  if (!validId(seriesId) || typeof file?.contentType !== "string" || !Object.hasOwn(COVER_TYPES, file.contentType)) {
    return fail("invalid_input");
  }
  if (!validId(file.size)) return fail("invalid_input");
  if (file.size > MAX_COVER_BYTES) return fail("upload_too_large");
  if (!isR2Configured()) return fail("storage_unavailable");
  try {
    if (!(await ownsEpisode(userId, seriesId, null))) return fail("series_not_found");
    const key = `covers/${seriesId}/${crypto.randomUUID()}.${COVER_TYPES[file.contentType as CoverContentType]}`;
    const upload = await presignPut("public", key, {
      contentType: file.contentType,
      size: file.size,
      cacheControl: COVER_CACHE_CONTROL,
    });
    return { ok: true, data: { key, upload } };
  } catch (e) {
    console.error("[studio:prepareCover]", e);
    return fail("storage_unavailable");
  }
}

/** Set (key) or remove (null) the cover. The old cover object is deleted. */
export async function saveSeriesCover(seriesId: number, key: string | null): Promise<ActionResult<null>> {
  const userId = await requireUploader();
  if (!validId(seriesId) || (key !== null && (typeof key !== "string" || !isCoverKeyOf(seriesId, key)))) {
    return fail("invalid_input");
  }
  if (key !== null) {
    try {
      const head = await headObject("public", key);
      if (!head) return fail("upload_incomplete");
      if (head.size > MAX_COVER_BYTES) {
        await deleteObjects("public", [key]);
        return fail("upload_too_large");
      }
    } catch (e) {
      console.error("[studio:verifyCover]", e);
      return fail("storage_unavailable");
    }
  }

  const db = await createClient();
  const old = await db.from("series").select("cover_key").eq("id", seriesId).eq("uploader_id", userId).maybeSingle();
  if (old.error) return fail(writeError("cover", old.error));
  if (!old.data) return fail("series_not_found");
  const { error } = await db.from("series").update({ cover_key: key }).eq("id", seriesId).eq("uploader_id", userId);
  if (error) return fail(writeError("cover", error));
  if (old.data.cover_key && old.data.cover_key !== key) await deleteObjects("public", [old.data.cover_key]);
  invalidateCatalog();
  refresh();
  return { ok: true, data: null };
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
