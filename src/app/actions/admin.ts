"use server";

import { refresh } from "next/cache";
import { getAdminId } from "@/lib/server/admin";
import { type ActionResult, fail } from "@/lib/server/errors";
import {
  banUser,
  endContentHold,
  liftSanction,
  markWithdrawalPaid,
  removeSeries,
  resolveReport,
  reviewWithdrawal,
  setContentHidden,
  setUserVerified,
  startContentHold,
  suspendUser,
  syncAuthBan,
} from "@/lib/server/rpc";

// Admin actions. Every one goes through an rpc.ts wrapper, which takes the
// admin id from the verified session (requireAdminId → not_admin otherwise)
// and the DB re-checks the role. Inputs from the client are only validated
// here, never trusted for identity.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON = 500;

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

function validIds(ids: unknown): ids is number[] {
  return Array.isArray(ids) && ids.length <= 200 && ids.every(validId);
}

function cleanReason(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && [...t].length <= MAX_REASON ? t : null;
}

type Ok = ActionResult<null>;
const OK: Ok = { ok: true, data: null };

/** Close the reports that led to an action (they may already be closed). */
async function closeReports(reportIds: number[], note: string) {
  for (const id of reportIds) {
    const r = await resolveReport({ reportId: id, status: "resolved", note });
    if (!r.ok && r.code !== "report_not_open") return r;
  }
  return OK;
}

// --- Reports ---

export async function dismissReports(reportIds: number[], note: string): Promise<Ok> {
  if (!validIds(reportIds) || reportIds.length === 0) return fail("invalid_input");
  for (const id of reportIds) {
    const r = await resolveReport({ reportId: id, status: "dismissed", note: note.trim().slice(0, MAX_REASON) || undefined });
    if (!r.ok && r.code !== "report_not_open") return r;
  }
  refresh();
  return OK;
}

export async function resolveReports(reportIds: number[], note: string): Promise<Ok> {
  if (!validIds(reportIds) || reportIds.length === 0) return fail("invalid_input");
  const r = await closeReports(reportIds, note.trim().slice(0, MAX_REASON) || "resolved");
  if (!r.ok) return r;
  refresh();
  return OK;
}

/** Hide/unhide a comment or review (hiding also resolves its open reports). */
export async function setHidden(
  targetType: "comment" | "review",
  targetId: number,
  hidden: boolean,
  note?: string,
): Promise<Ok> {
  if ((targetType !== "comment" && targetType !== "review") || !validId(targetId) || typeof hidden !== "boolean") {
    return fail("invalid_input");
  }
  const r = await setContentHidden({ targetType, targetId, hidden, note: note?.trim().slice(0, MAX_REASON) });
  if (!r.ok) return r;
  refresh();
  return OK;
}

// --- Series ---

export async function holdSeries(seriesId: number, reason: string, reportIds: number[] = []): Promise<Ok> {
  const why = cleanReason(reason);
  if (!validId(seriesId) || !why || !validIds(reportIds)) return fail(why ? "invalid_input" : "reason_required");
  const r = await startContentHold({ seriesId, reason: why });
  if (!r.ok) return r;
  const c = await closeReports(reportIds, `hold: ${why}`);
  refresh();
  return c;
}

export async function releaseSeries(seriesId: number): Promise<Ok> {
  if (!validId(seriesId)) return fail("invalid_input");
  const r = await endContentHold(seriesId);
  if (!r.ok) return r;
  refresh();
  return OK;
}

/** Take a series down for good (refunds readers; see remove_series). */
export async function takeDownSeries(seriesId: number, reason: string, reportIds: number[] = []): Promise<Ok> {
  const why = cleanReason(reason);
  if (!validId(seriesId) || !why || !validIds(reportIds)) return fail(why ? "invalid_input" : "reason_required");
  // remove_series also lets an uploader delete their own series; this action is admin-only.
  if (!(await getAdminId())) return fail("not_admin");
  const r = await removeSeries(seriesId);
  if (!r.ok) return r;
  const c = await closeReports(reportIds, `removed: ${why}`);
  refresh();
  return c;
}

// --- Users ---

export async function suspendAccount(
  userId: string,
  reason: string,
  days: number | null,
  reportIds: number[] = [],
): Promise<Ok> {
  const why = cleanReason(reason);
  if (!UUID_RE.test(userId) || !why || !validIds(reportIds)) return fail(why ? "invalid_input" : "reason_required");
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return fail("invalid_input");
  const r = await suspendUser({
    userId,
    reason: why,
    endsAt: days === null ? undefined : new Date(Date.now() + days * 86_400_000),
  });
  if (!r.ok) return r;
  const c = await closeReports(reportIds, `suspend: ${why}`);
  refresh();
  return c;
}

/** Ban (DB + Supabase Auth). Retries the Auth ban once if it failed. */
export async function banAccount(userId: string, reason: string, reportIds: number[] = []): Promise<ActionResult<{ sessionRevoked: boolean }>> {
  const why = cleanReason(reason);
  if (!UUID_RE.test(userId) || !why || !validIds(reportIds)) return fail(why ? "invalid_input" : "reason_required");
  const r = await banUser({ userId, reason: why });
  if (!r.ok) return r;
  const revoked = r.data.session_revoked || (await syncAuthBan(userId, true));
  const c = await closeReports(reportIds, `ban: ${why}`);
  refresh();
  if (!c.ok) return c;
  return { ok: true, data: { sessionRevoked: revoked } };
}

export async function liftAccountSanction(sanctionId: number): Promise<Ok> {
  if (!validId(sanctionId)) return fail("invalid_input");
  const r = await liftSanction(sanctionId);
  if (!r.ok) return r;
  refresh();
  return OK;
}

export async function setVerified(userId: string, verified: boolean): Promise<Ok> {
  if (!UUID_RE.test(userId) || typeof verified !== "boolean") return fail("invalid_input");
  const r = await setUserVerified({ userId, verified });
  if (!r.ok) return r;
  refresh();
  return OK;
}

// --- Withdrawals ---

export async function approveWithdrawal(withdrawalId: number): Promise<Ok> {
  if (!validId(withdrawalId)) return fail("invalid_input");
  const r = await reviewWithdrawal({ withdrawalId, approve: true });
  if (!r.ok) return r;
  refresh();
  return OK;
}

export async function rejectWithdrawal(withdrawalId: number, reason: string): Promise<Ok> {
  const why = cleanReason(reason);
  if (!validId(withdrawalId)) return fail("invalid_input");
  if (!why) return fail("reject_reason_required");
  const r = await reviewWithdrawal({ withdrawalId, approve: false, rejectReason: why });
  if (!r.ok) return r;
  refresh();
  return OK;
}

export async function markPaid(withdrawalId: number, transferRef: string): Promise<Ok> {
  const ref = cleanReason(transferRef);
  if (!validId(withdrawalId)) return fail("invalid_input");
  if (!ref || ref.length > 100) return fail("transfer_ref_required");
  const r = await markWithdrawalPaid({ withdrawalId, transferRef: ref });
  if (!r.ok) return r;
  refresh();
  return OK;
}
