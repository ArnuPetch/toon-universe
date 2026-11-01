import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getClaims, getUserId } from "./auth";
import type { SeriesSummary } from "./home";
import type { BookshelfStatus } from "./series";

// Personal pages: /bookshelf, /notifications, /profile. Never cached.
// RLS limits every table read here to the signed-in user's own rows; series the
// user can no longer see (taken down) come back as null joins and are skipped.

// --- Bookshelf ---

export type ShelfItem = SeriesSummary & {
  status: BookshelfStatus;
  addedAt: string;
  lastEpisodeAt: string | null;
  progress: { episodeNumber: number; page: number; pageCount: number; updatedAt: string } | null;
  /** A new episode came out after the reader last opened the series. */
  hasNew: boolean;
};

export type FollowItem = SeriesSummary & { lastEpisodeAt: string | null; followedAt: string };

export type Library = { shelf: ShelfItem[]; follows: FollowItem[]; now: number };

const SHELF_LIMIT = 500;

/** null when signed out. */
export async function getLibrary(): Promise<Library | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = await createClient();
  const [entries, progress, follows] = await Promise.all([
    db
      .from("bookshelf_entries")
      .select("status, updated_at, series(id, slug, title, cover_key, last_episode_at)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(SHELF_LIMIT),
    db
      .from("reading_progress")
      .select("series_id, page_number, updated_at, episodes(number, page_count)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(SHELF_LIMIT),
    db
      .from("series_follows")
      .select("created_at, series(id, slug, title, cover_key, last_episode_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(SHELF_LIMIT),
  ]);
  for (const r of [entries, progress, follows]) if (r.error) console.error("[library]", r.error);

  const progressBySeries = new Map(
    (progress.data ?? []).flatMap((p) =>
      p.episodes
        ? [
            [
              p.series_id,
              {
                episodeNumber: p.episodes.number,
                page: p.page_number,
                pageCount: p.episodes.page_count,
                updatedAt: p.updated_at,
              },
            ] as const,
          ]
        : [],
    ),
  );

  const shelf = (entries.data ?? []).flatMap((e): ShelfItem[] => {
    const s = e.series;
    if (!s) return [];
    const prog = progressBySeries.get(s.id) ?? null;
    return [
      {
        id: s.id,
        slug: s.slug,
        title: s.title,
        coverKey: s.cover_key,
        genres: [],
        status: e.status,
        addedAt: e.updated_at,
        lastEpisodeAt: s.last_episode_at,
        progress: prog,
        hasNew:
          e.status !== "completed" &&
          prog != null &&
          s.last_episode_at != null &&
          Date.parse(s.last_episode_at) > Date.parse(prog.updatedAt),
      },
    ];
  });

  return {
    shelf,
    follows: (follows.data ?? []).flatMap((f) =>
      f.series
        ? [
            {
              id: f.series.id,
              slug: f.series.slug,
              title: f.series.title,
              coverKey: f.series.cover_key,
              genres: [],
              lastEpisodeAt: f.series.last_episode_at,
              followedAt: f.created_at,
            },
          ]
        : [],
    ),
    now: Date.now(),
  };
}

// --- Notifications ---

export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export const NOTIFICATION_LIMIT = 50;

const WITHDRAWAL_STATUS: Record<string, string> = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว รอโอนเงิน",
  paid: "โอนเงินแล้ว",
  rejected: "ไม่อนุมัติ",
};

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function describe(
  type: string,
  p: Payload,
  series: { id: number; slug: string; title: string } | null,
  episode: { number: number } | null,
): Pick<NotificationItem, "title" | "body" | "href"> {
  const seriesTitle = series?.title ?? str(p.series_title) ?? "ผลงาน";
  switch (type) {
    case "new_episode": {
      const n = episode?.number ?? num(p.episode_number);
      const epTitle = str(p.episode_title);
      return {
        title: seriesTitle,
        body: `ตอนที่ ${n ?? "ใหม่"} มาแล้ว${epTitle ? ` · ${epTitle}` : ""}`,
        href: series && n ? `/series/${series.slug}/${n}` : series ? `/series/${series.slug}` : null,
      };
    }
    case "refund": {
      const coins = num(p.coins) ?? 0;
      const what = p.kind === "donation" ? "ที่สนับสนุนผู้เขียน" : "ที่ใช้ปลดล็อกตอน";
      const note = str(p.note);
      return {
        title: `คืน ${coins.toLocaleString("th-TH")} coin`,
        body: `คืน coin ${what}${series ? ` ใน "${series.title}"` : ""}${note ? ` — ${note}` : ""}`,
        href: "/coins",
      };
    }
    case "withdrawal_update": {
      const amount = num(p.amount);
      const reason = str(p.reason);
      return {
        title: "คำขอถอนเงิน",
        body: `${amount != null ? `${amount.toLocaleString("th-TH")} บาท · ` : ""}${
          WITHDRAWAL_STATUS[String(p.status)] ?? "อัพเดตสถานะ"
        }${reason ? ` — ${reason === "account_banned" ? "บัญชีถูกแบน" : reason}` : ""}`,
        href: "/studio/earnings",
      };
    }
    case "moderation": {
      const started = p.action === "hold_started";
      const reason = str(p.reason);
      return {
        title: seriesTitle,
        body: started
          ? `ผลงานถูกปิดชั่วคราวเพื่อตรวจสอบ${reason ? ` — ${reason}` : ""}`
          : "ผลงานเปิดให้อ่านตามปกติแล้ว",
        // Only the uploader gets these → their studio page for the series.
        href: series ? `/studio/series/${series.id}` : null,
      };
    }
    case "comment_reply": {
      const n = episode?.number ?? num(p.episode_number);
      const who = str(p.replier_name) ?? "มีคน";
      const snippet = str(p.snippet);
      const page = series ? (n ? `/series/${series.slug}/${n}` : `/series/${series.slug}`) : null;
      return {
        title: `${who} ตอบกลับความคิดเห็นของคุณ`,
        body: `${seriesTitle}${n ? ` ตอนที่ ${n}` : ""}${snippet ? ` — “${snippet}”` : ""}`,
        href: page ? `${page}#comments` : null,
      };
    }
    default:
      return { title: str(p.title) ?? "ประกาศจาก Toon Universe", body: str(p.message) ?? "", href: null };
  }
}

/** Latest notifications; null when signed out. */
export async function getNotifications(): Promise<{ items: NotificationItem[]; now: number } | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("notifications")
    .select("id, type, payload, read_at, created_at, series(id, slug, title), episodes(number)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_LIMIT);
  if (error) console.error("[notifications]", error);
  return {
    items: (data ?? []).map((n) => ({
      id: n.id,
      ...describe(
        n.type,
        n.payload && typeof n.payload === "object" && !Array.isArray(n.payload) ? (n.payload as Payload) : {},
        n.series,
        n.episodes,
      ),
      read: n.read_at != null,
      createdAt: n.created_at,
    })),
    now: Date.now(),
  };
}

// --- Profile ---

export type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  verified: boolean;
  status: "active" | "suspended" | "banned";
  birthDate: string | null;
  joinedAt: string;
  /** Today in Thailand (YYYY-MM-DD), the latest valid birth date. */
  today: string;
};

/** null when signed out. */
export async function getProfile(): Promise<Profile | null> {
  const claims = await getClaims();
  const userId = claims?.sub;
  if (!userId) return null;
  const db = await createClient();
  const [profile, info] = await Promise.all([
    db
      .from("profiles")
      .select("username, display_name, bio, is_verified, status, created_at")
      .eq("id", userId)
      .maybeSingle(),
    db.from("user_private_info").select("birth_date").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error) console.error("[profile]", profile.error);
  const p = profile.data;
  return {
    id: userId,
    email: typeof claims.email === "string" ? claims.email : null,
    username: p?.username ?? null,
    displayName: p?.display_name ?? null,
    bio: p?.bio ?? null,
    verified: p?.is_verified ?? false,
    status: p?.status ?? "active",
    birthDate: info.data?.birth_date ?? null,
    joinedAt: p?.created_at ?? new Date(0).toISOString(),
    today: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()),
  };
}
