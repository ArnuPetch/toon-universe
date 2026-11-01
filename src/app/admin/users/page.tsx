import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/shell";
import { ACCOUNT_STATUS_LABEL, formatDate } from "@/components/format";
import { INPUT, PRIMARY_BUTTON } from "@/components/form-styles";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { EmptyState } from "@/components/page";
import { ACCOUNT_TONE, Pill } from "@/components/studio/bits";
import { findUsers } from "@/lib/server/admin";

export const metadata: Metadata = {
  title: "ผู้ใช้ — ผู้ดูแลระบบ",
  robots: { index: false },
};

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <AdminShell section="/admin/users" title="ผู้ใช้" sub="ค้นหาด้วยอีเมล ชื่อผู้ใช้ ชื่อที่แสดง หรือ user id" next="/admin/users">
      <Users search={searchParams as Promise<{ q?: string }>} />
    </AdminShell>
  );
}

async function Users({ search }: { search: Promise<{ q?: string }> }) {
  const sp = await search;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const users = await findUsers(q);
  return (
    <>
      <form action="/admin/users" role="search" className="flex gap-2">
        <input name="q" type="search" defaultValue={q} placeholder="ค้นหาผู้ใช้" aria-label="ค้นหาผู้ใช้" className={INPUT} />
        <button type="submit" className={PRIMARY_BUTTON}>
          ค้นหา
        </button>
      </form>
      {users.length === 0 ? (
        <EmptyState title="ไม่พบผู้ใช้" />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-surface">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/users/${u.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-surface-2 lg:px-5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-[1.4]">
                    <span className="truncate">{u.displayName || (u.username ? `@${u.username}` : u.email)}</span>
                    {u.verified && (
                      <span title="ยืนยันตัวตนแล้ว" className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-white">
                        <CheckIcon size={10} strokeWidth={3} />
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs leading-[1.4] text-muted">
                    {u.email}
                    {u.username && ` · @${u.username}`} · สมัคร {formatDate(u.createdAt)}
                    {u.seriesCount > 0 && ` · ${u.seriesCount} เรื่อง`}
                  </p>
                </div>
                {u.isAdmin && <Pill tone="primary">admin</Pill>}
                {u.status !== "active" && <Pill tone={ACCOUNT_TONE[u.status]}>{ACCOUNT_STATUS_LABEL[u.status]}</Pill>}
                <ChevronRightIcon size={18} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
