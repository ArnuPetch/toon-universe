import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { getClaims } from "./auth";

// Admin pages (/admin). Reads use the service_role client (admins see hidden /
// removed content, other users' money rows, emails) — so EVERY loader first
// checks the verified JWT's app_metadata.role (adminId()). Mutations go through
// the RPC wrappers in rpc.ts, which the DB re-checks with private.assert_admin.
// Never cached.

type Enums = Database["public"]["Enums"];

/** Verified admin id, or null (signed out / not an admin). */
export async function getAdminId(): Promise<string | null> {
  const claims = await getClaims();
  if (!claims?.sub || claims.app_metadata?.role !== "admin") return null;
  return claims.sub;
}

/** For pages: "signed_out" → sign-in prompt, "forbidden" → 404. */
export async function adminGate(): Promise<"ok" | "signed_out" | "forbidden"> {
  const claims = await getClaims();
  if (!claims?.sub) return "signed_out";
  return claims.app_metadata?.role === "admin" ? "ok" : "forbidden";
}

async function db() {
  if (!(await getAdminId())) throw new Error("admin loader called without an admin session");
  return createAdminClient();
}

const nameOf = (p: { display_name: string | null; username: string | null } | null) =>
  p ? p.display_name || (p.username ? `@${p.username}` : "ไม่มีชื่อ") : "ผู้ใช้ที่ถูกลบ";

// --- Overview ---

export type AdminCounts = {
  openReports: number;
  pendingWithdrawals: number;
  approvedWithdrawals: number;
  underReview: number;
};

export async function getAdminCounts(): Promise<AdminCounts> {
  const c = await db();
  const head = { count: "exact" as const, head: true };
  const [reports, pending, approved, held] = await Promise.all([
    c.from("reports").select("id", head).eq("status", "open"),
    c.from("withdrawals").select("id", head).eq("status", "pending"),
    c.from("withdrawals").select("id", head).eq("status", "approved"),
    c.from("series").select("id", head).eq("moderation_status", "under_review").is("deleted_at", null),
  ]);
  for (const r of [reports, pending, approved, held]) if (r.error) console.error("[admin:counts]", r.error);
  return {
    openReports: reports.count ?? 0,
    pendingWithdrawals: pending.count ?? 0,
    approvedWithdrawals: approved.count ?? 0,
    underReview: held.count ?? 0,
  };
}

// --- Reports ---

export type ReportStatus = Enums["report_status"];
export type ReportTarget = Enums["report_target"];

export type ReportEntry = {
  id: number;
  reason: Enums["report_reason"];
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reporter: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

type UserRef = { id: string; name: string; status: Enums["account_status"] };

/** Reports grouped by what they point at, so a target reported 5 times shows once. */
export type ReportGroup = {
  key: string;
  type: ReportTarget;
  reports: ReportEntry[];
  /** Comment / review being reported. */
  content: {
    id: number;
    body: string | null;
    rating: number | null;
    isSpoiler: boolean;
    hidden: boolean;
    deleted: boolean;
    author: UserRef | null;
    where: { title: string; href: string | null };
  } | null;
  series: {
    id: number;
    title: string;
    slug: string;
    moderation: Enums["moderation_status"];
    deleted: boolean;
    uploader: UserRef | null;
  } | null;
  user: (UserRef & { username: string | null }) | null;
};

const REPORT_LIMIT = 100;

type ProfileRow = { id: string; display_name: string | null; username: string | null; status: Enums["account_status"] } | null;
const userRef = (p: ProfileRow): UserRef | null => (p ? { id: p.id, name: nameOf(p), status: p.status } : null);

export async function getReports(status: ReportStatus, type: ReportTarget | null): Promise<ReportGroup[]> {
  const c = await db();
  const author = "id, display_name, username, status";
  let q = c
    .from("reports")
    .select(
      `id, target_type, reason, details, status, created_at, resolved_at, resolution_note,
       reporter:profiles!reports_reporter_id_fkey(display_name, username),
       series(id, slug, title, moderation_status, deleted_at, uploader:profiles!series_uploader_id_fkey(${author})),
       comment:comments(id, body, is_spoiler, hidden_at, deleted_at, episode_id,
         author:profiles!comments_user_id_fkey(${author}), series(slug, title), episodes(number)),
       review:reviews(id, body, rating, is_spoiler, hidden_at, episode_id,
         author:profiles!reviews_user_id_fkey(${author}), series(slug, title), episodes(number)),
       target_user:profiles!reports_target_user_id_fkey(${author})`,
    )
    .eq("status", status)
    .order("created_at", { ascending: status !== "open" ? false : true })
    .limit(REPORT_LIMIT);
  if (type) q = q.eq("target_type", type);
  const { data, error } = await q;
  if (error) console.error("[admin:reports]", error);

  const groups = new Map<string, ReportGroup>();
  for (const r of data ?? []) {
    const key = `${r.target_type}:${r.series?.id ?? r.comment?.id ?? r.review?.id ?? r.target_user?.id ?? r.id}`;
    let g = groups.get(key);
    if (!g) {
      const content = r.comment ?? r.review;
      const where = content?.series
        ? {
            title: `${content.series.title}${content.episodes ? ` ตอนที่ ${content.episodes.number}` : ""}`,
            href: `/series/${content.series.slug}${content.episodes ? `/${content.episodes.number}` : ""}`,
          }
        : { title: "—", href: null };
      g = {
        key,
        type: r.target_type,
        reports: [],
        content: content
          ? {
              id: content.id,
              body: content.body,
              rating: r.review?.rating ?? null,
              isSpoiler: content.is_spoiler,
              hidden: content.hidden_at != null,
              deleted: r.comment?.deleted_at != null,
              author: userRef(content.author),
              where,
            }
          : null,
        series: r.series
          ? {
              id: r.series.id,
              title: r.series.title,
              slug: r.series.slug,
              moderation: r.series.moderation_status,
              deleted: r.series.deleted_at != null,
              uploader: userRef(r.series.uploader),
            }
          : null,
        user: r.target_user ? { ...userRef(r.target_user)!, username: r.target_user.username } : null,
      };
      groups.set(key, g);
    }
    g.reports.push({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
      reporter: nameOf(r.reporter),
      resolvedAt: r.resolved_at,
      resolutionNote: r.resolution_note,
    });
  }
  // Most-reported first, then oldest.
  return [...groups.values()].sort((a, b) => b.reports.length - a.reports.length);
}

// --- Withdrawals ---

export type AdminWithdrawal = {
  id: number;
  amount: number;
  status: Enums["withdrawal_status"];
  promptpayId: string;
  accountName: string;
  requestedAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  transferRef: string | null;
  rejectReason: string | null;
  uploader: UserRef | null;
};

export async function getWithdrawals(status: Enums["withdrawal_status"]): Promise<AdminWithdrawal[]> {
  const c = await db();
  const { data, error } = await c
    .from("withdrawals")
    .select(
      "id, amount, status, promptpay_id, account_name, requested_at, reviewed_at, paid_at, transfer_ref, reject_reason, uploader:profiles!withdrawals_uploader_id_fkey(id, display_name, username, status)",
    )
    .eq("status", status)
    .order("requested_at", { ascending: status === "pending" || status === "approved" })
    .limit(100);
  if (error) console.error("[admin:withdrawals]", error);
  return (data ?? []).map((w) => ({
    id: w.id,
    amount: w.amount,
    status: w.status,
    promptpayId: w.promptpay_id,
    accountName: w.account_name,
    requestedAt: w.requested_at,
    reviewedAt: w.reviewed_at,
    paidAt: w.paid_at,
    transferRef: w.transfer_ref,
    rejectReason: w.reject_reason,
    uploader: userRef(w.uploader),
  }));
}

// --- Users ---

export type AdminUserRow = {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  status: Enums["account_status"];
  verified: boolean;
  isAdmin: boolean;
  createdAt: string;
  seriesCount: number;
};

export async function findUsers(query: string): Promise<AdminUserRow[]> {
  const adminId = await getAdminId();
  if (!adminId) return [];
  const { data, error } = await createAdminClient().rpc("admin_find_users", {
    p_admin_id: adminId,
    p_query: query,
    p_limit: 50,
  });
  if (error) console.error("[admin:findUsers]", error);
  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.display_name,
    status: u.status,
    verified: u.is_verified,
    isAdmin: u.is_admin,
    createdAt: u.created_at,
    seriesCount: u.series_count,
  }));
}

export type AdminUserDetail = AdminUserRow & {
  bio: string | null;
  wallet: { purchased: number; welcome: number } | null;
  sanctions: {
    id: number;
    kind: Enums["sanction_kind"];
    reason: string;
    startsAt: string;
    endsAt: string | null;
    liftedAt: string | null;
    active: boolean;
  }[];
  series: { id: number; slug: string; title: string; visibility: Enums["series_visibility"]; moderation: Enums["moderation_status"]; deleted: boolean }[];
  openReports: number;
  now: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAdminUser(userId: string): Promise<AdminUserDetail | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await findUsers(userId);
  if (!row || row.id !== userId) return null;
  const c = await db();
  const [profile, wallet, sanctions, series, reports] = await Promise.all([
    c.from("profiles").select("bio").eq("id", userId).single(),
    c.from("coin_wallets").select("purchased_balance, welcome_balance, welcome_expires_at").eq("user_id", userId).maybeSingle(),
    c
      .from("user_sanctions")
      .select("id, kind, reason, starts_at, ends_at, lifted_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    c
      .from("series")
      .select("id, slug, title, visibility, moderation_status, deleted_at")
      .eq("uploader_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    c.from("reports").select("id", { count: "exact", head: true }).eq("target_user_id", userId).eq("status", "open"),
  ]);
  for (const r of [profile, wallet, sanctions, series, reports]) if (r.error) console.error("[admin:user]", r.error);

  const now = Date.now();
  const w = wallet.data;
  return {
    ...row,
    bio: profile.data?.bio ?? null,
    wallet: w
      ? {
          purchased: w.purchased_balance,
          welcome: w.welcome_expires_at && Date.parse(w.welcome_expires_at) > now ? w.welcome_balance : 0,
        }
      : null,
    sanctions: (sanctions.data ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      reason: s.reason,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      liftedAt: s.lifted_at,
      active: s.lifted_at == null && (s.ends_at == null || Date.parse(s.ends_at) > now),
    })),
    series: (series.data ?? []).map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      visibility: s.visibility,
      moderation: s.moderation_status,
      deleted: s.deleted_at != null,
    })),
    openReports: reports.count ?? 0,
    now,
  };
}

// --- Series ---

export type AdminSeriesRow = {
  id: number;
  slug: string;
  title: string;
  coverKey: string | null;
  visibility: Enums["series_visibility"];
  moderation: Enums["moderation_status"];
  ageRating: Enums["age_rating"];
  deleted: boolean;
  uploader: UserRef | null;
  hold: { reason: string; startedAt: string } | null;
  createdAt: string;
};

export type SeriesFilter = "all" | "under_review" | "removed";

export async function findSeries(query: string, filter: SeriesFilter): Promise<AdminSeriesRow[]> {
  const c = await db();
  let q = c
    .from("series")
    .select(
      "id, slug, title, cover_key, visibility, moderation_status, age_rating, deleted_at, created_at, uploader:profiles!series_uploader_id_fkey(id, display_name, username, status), content_holds(reason, started_at, ended_at)",
    )
    .order("created_at", { ascending: false })
    .limit(60);
  const term = query.trim();
  if (/^\d+$/.test(term)) q = q.eq("id", Number(term));
  else if (term) {
    const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    q = q.or(`title.ilike.${JSON.stringify(like)},slug.ilike.${JSON.stringify(like)}`);
  }
  if (filter === "under_review") q = q.eq("moderation_status", "under_review").is("deleted_at", null);
  if (filter === "removed") q = q.or("moderation_status.eq.removed,deleted_at.not.is.null");
  const { data, error } = await q;
  if (error) console.error("[admin:series]", error);
  return (data ?? []).map((s) => {
    const open = s.content_holds.find((h) => h.ended_at == null);
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      coverKey: s.cover_key,
      visibility: s.visibility,
      moderation: s.moderation_status,
      ageRating: s.age_rating,
      deleted: s.deleted_at != null,
      uploader: userRef(s.uploader),
      hold: open ? { reason: open.reason, startedAt: open.started_at } : null,
      createdAt: s.created_at,
    };
  });
}
