import Link from "next/link";
import type { ReactNode } from "react";
import { LinkTabs } from "../browse/link-tabs";

// Server-safe building blocks shared by the studio and admin pages.

export const CARD = "rounded-[20px] bg-surface p-5 lg:p-6";

type Tone = "neutral" | "primary" | "free" | "gold" | "hot";

const TONE: Record<Tone, string> = {
  neutral: "bg-white/12 text-text-2",
  primary: "bg-primary/20 text-tag",
  free: "bg-free/15 text-free",
  gold: "bg-gold/15 text-gold",
  hot: "bg-hot/15 text-hot",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-xs font-semibold leading-none ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export const VISIBILITY_TONE = { draft: "neutral", published: "free" } as const;
export const MODERATION_TONE = { active: "free", under_review: "gold", removed: "hot" } as const;
export const EPISODE_STATE_TONE = { draft: "neutral", scheduled: "primary", released: "free" } as const;
export const WITHDRAWAL_TONE = { pending: "gold", approved: "primary", paid: "free", rejected: "hot" } as const;
export const ACCOUNT_TONE = { active: "free", suspended: "gold", banned: "hot" } as const;

/** Big number with a label; `sub` for the 30-day figure etc. */
export function StatTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] bg-surface p-4 lg:p-5">
      <span className="text-[13px] leading-[1.4] text-muted lg:text-sm">{label}</span>
      <span className={`text-xl font-bold leading-[1.3] lg:text-2xl ${accent ? "text-gold" : ""}`}>{value}</span>
      {sub && <span className="text-xs leading-[1.4] text-faint">{sub}</span>}
    </div>
  );
}

export function StudioNav({ current }: { current: "/studio" | "/studio/earnings" }) {
  return (
    <LinkTabs
      label="เมนูสตูดิโอ"
      options={[
        { href: "/studio", label: "ผลงานของฉัน", current: current === "/studio" },
        { href: "/studio/earnings", label: "รายได้ & ถอนเงิน", current: current === "/studio/earnings" },
      ]}
    />
  );
}

export type AdminSection = "/admin" | "/admin/reports" | "/admin/withdrawals" | "/admin/users" | "/admin/series";

export function AdminNav({ current }: { current: AdminSection }) {
  const items: { href: AdminSection; label: string }[] = [
    { href: "/admin", label: "ภาพรวม" },
    { href: "/admin/reports", label: "รายงาน" },
    { href: "/admin/withdrawals", label: "ถอนเงิน" },
    { href: "/admin/users", label: "ผู้ใช้" },
    { href: "/admin/series", label: "ผลงาน" },
  ];
  return (
    <LinkTabs label="เมนูผู้ดูแล" options={items.map((i) => ({ ...i, current: i.href === current }))} />
  );
}

/** Breadcrumb-ish back link row above a page title. */
export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="ตำแหน่ง" className="text-[13px] leading-[1.4] text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {it.href ? (
              <Link href={it.href} className="transition-colors hover:text-text">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-text-2">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
