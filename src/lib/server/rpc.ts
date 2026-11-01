import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { requireAdminId, requireUserId } from "./auth";
import { AppError, type ActionResult, fail, isErrorCode } from "./errors";

// Wrappers around the service-role-only Postgres RPCs.
//
// Rules:
// - The acting user/admin id always comes from the verified session
//   (requireUserId / requireAdminId), never from the caller's arguments.
// - Every wrapper returns an ActionResult instead of throwing, so Server Actions
//   can pass it straight to the client (thrown errors are redacted in prod).

type Functions = Database["public"]["Functions"];
type FnName = keyof Functions;

async function callRpc<T>(fn: FnName, args: Functions[FnName]["Args"]): Promise<ActionResult<T>> {
  const supabase = createAdminClient();
  // `args` is checked per wrapper below; supabase-js can't narrow a union key.
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) return mapPostgrestError(fn, error);
  return { ok: true, data: data as T };
}

function mapPostgrestError(fn: string, error: PostgrestError): ActionResult<never> {
  if (error.code === "P0001" && isErrorCode(error.message)) {
    return fail(error.message, error.details || undefined);
  }
  // Anything else (42501 = missing grant, constraint violation, network…) is a bug
  // or an outage: log the full error server-side, show a generic message.
  console.error(`[rpc:${fn}]`, error);
  return fail("unexpected_error");
}

/** Run an auth guard + action, converting AppError into an ActionResult. */
async function guarded<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof AppError) return fail(e.code, e.detail);
    console.error("[rpc]", e);
    return fail("unexpected_error");
  }
}

// =============================================================================
// Result types (mirror the jsonb_build_object(...) in the SQL functions)
// =============================================================================

export type RefundSummary = {
  unlocks_refunded?: number;
  donations_refunded?: number;
  coins_refunded: number;
};

export type UnlockResult = {
  unlock_id: number;
  expires_at: string;
  already_unlocked: boolean;
  purchased_coins_used?: number;
  welcome_coins_used?: number;
  purchased_balance: number;
  welcome_balance: number;
};

export type DonateResult = { donation_id: number; purchased_balance: number };

export type RemoveSeriesResult = {
  series_id: number;
  unlocks: RefundSummary;
  donations: RefundSummary;
};

export type RemoveEpisodeResult = {
  episode_id: number;
  series_id: number;
  unlocks: RefundSummary;
};

export type WithdrawalRequestResult = {
  withdrawal_id: number;
  amount: number;
  earnings_count: number;
};

export type WithdrawalStatusResult = {
  withdrawal_id: number;
  status: Database["public"]["Enums"]["withdrawal_status"];
  paid_at?: string;
};

type AccountStatus = Database["public"]["Enums"]["account_status"];

export type SuspendResult = { sanction_id: number; status: AccountStatus };

export type BanResult = {
  sanction_id: number;
  series_removed: unknown;
  unlocks: unknown;
  donations: unknown;
  withdrawals_rejected: unknown;
  earnings_forfeited: unknown;
  coins_forfeited: { purchased: number; welcome: number };
  /** false → DB ban committed but Auth ban failed; call syncAuthBan() again. */
  session_revoked: boolean;
};

export type LiftSanctionResult = {
  user_id: string;
  status: AccountStatus;
  session_unbanned: boolean;
};

export type StartHoldResult = { hold_id: number; started_at: string };
export type EndHoldResult = { hold_id: number; extended_by_seconds: number };

// =============================================================================
// Reader
// =============================================================================

export function unlockEpisode(episodeId: number) {
  return guarded(async () =>
    callRpc<UnlockResult>("unlock_episode", {
      p_user_id: await requireUserId(),
      p_episode_id: episodeId,
    }),
  );
}

export function donate(input: {
  toUserId: string;
  amount: number;
  seriesId?: number;
  message?: string;
}) {
  return guarded(async () =>
    callRpc<DonateResult>("donate", {
      p_from_user_id: await requireUserId(),
      p_to_user_id: input.toUserId,
      p_amount: input.amount,
      p_series_id: input.seriesId,
      p_message: input.message,
    }),
  );
}

// =============================================================================
// Uploader (the DB checks ownership; admins may also call these)
// =============================================================================

export function removeSeries(seriesId: number) {
  return guarded(async () =>
    callRpc<RemoveSeriesResult>("remove_series", {
      p_series_id: seriesId,
      p_actor_id: await requireUserId(),
    }),
  );
}

export function removeEpisode(episodeId: number) {
  return guarded(async () =>
    callRpc<RemoveEpisodeResult>("remove_episode", {
      p_episode_id: episodeId,
      p_actor_id: await requireUserId(),
    }),
  );
}

export function requestWithdrawal() {
  return guarded(async () =>
    callRpc<WithdrawalRequestResult>("request_withdrawal", {
      p_uploader_id: await requireUserId(),
    }),
  );
}

// =============================================================================
// Admin
// =============================================================================

export function reviewWithdrawal(input: {
  withdrawalId: number;
  approve: boolean;
  rejectReason?: string;
}) {
  return guarded(async () =>
    callRpc<WithdrawalStatusResult>("review_withdrawal", {
      p_withdrawal_id: input.withdrawalId,
      p_admin_id: await requireAdminId(),
      p_approve: input.approve,
      p_reject_reason: input.rejectReason,
    }),
  );
}

export function markWithdrawalPaid(input: { withdrawalId: number; transferRef: string }) {
  return guarded(async () =>
    callRpc<WithdrawalStatusResult>("mark_withdrawal_paid", {
      p_withdrawal_id: input.withdrawalId,
      p_admin_id: await requireAdminId(),
      p_transfer_ref: input.transferRef,
    }),
  );
}

export function suspendUser(input: { userId: string; reason: string; endsAt?: Date }) {
  return guarded(async () =>
    callRpc<SuspendResult>("suspend_user", {
      p_user_id: input.userId,
      p_admin_id: await requireAdminId(),
      p_reason: input.reason,
      p_ends_at: input.endsAt?.toISOString(),
    }),
  );
}

// ~100 years. Supabase Auth has no "forever"; this blocks sign-in and refresh.
const PERMANENT_BAN = "876000h";

/**
 * Ban in the DB (forfeits, refunds, hides series) and then in Supabase Auth so
 * the user can't sign in or refresh their session. The DB step runs first:
 * it can fail on business rules (already_banned, …) and we must not leave an
 * Auth ban behind for a user the DB didn't ban.
 *
 * Note: an access token that was already issued stays valid until it expires
 * (JWT expiry), but every RPC re-checks profiles.status, so the user can't
 * spend/withdraw in that window.
 */
export function banUser(input: { userId: string; reason: string }) {
  return guarded(async () => {
    const result = await callRpc<Omit<BanResult, "session_revoked">>("ban_user", {
      p_user_id: input.userId,
      p_admin_id: await requireAdminId(),
      p_reason: input.reason,
    });
    if (!result.ok) return result;

    const sessionRevoked = await syncAuthBan(input.userId, true);
    return { ok: true, data: { ...result.data, session_revoked: sessionRevoked } };
  });
}

/** Lifting a ban does not restore forfeited coins/series (by design). */
export function liftSanction(sanctionId: number) {
  return guarded(async () => {
    const result = await callRpc<Omit<LiftSanctionResult, "session_unbanned">>("lift_sanction", {
      p_sanction_id: sanctionId,
      p_admin_id: await requireAdminId(),
    });
    if (!result.ok) return result;

    // Only clear the Auth ban when the user is no longer banned in the DB.
    // (Suspensions don't touch Auth, so clearing is a harmless no-op for them.)
    const sessionUnbanned =
      result.data.status !== "banned" ? await syncAuthBan(result.data.user_id, false) : false;
    return { ok: true, data: { ...result.data, session_unbanned: sessionUnbanned } };
  });
}

/**
 * Apply/clear the Supabase Auth ban. Returns false (and logs) on failure so the
 * caller can surface a retry; the DB state is already committed.
 */
export async function syncAuthBan(userId: string, banned: boolean): Promise<boolean> {
  await requireAdminId();
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: banned ? PERMANENT_BAN : "none",
  });
  if (error) {
    console.error(`[auth:ban] user=${userId} banned=${banned}`, error);
    return false;
  }
  return true;
}

export function startContentHold(input: { seriesId: number; reason: string }) {
  return guarded(async () =>
    callRpc<StartHoldResult>("start_content_hold", {
      p_series_id: input.seriesId,
      p_admin_id: await requireAdminId(),
      p_reason: input.reason,
    }),
  );
}

export function endContentHold(seriesId: number) {
  return guarded(async () =>
    callRpc<EndHoldResult>("end_content_hold", {
      p_series_id: seriesId,
      p_admin_id: await requireAdminId(),
    }),
  );
}
