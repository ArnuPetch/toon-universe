import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAction } from "@/components/admin/admin-action";
import { AdminShell } from "@/components/admin/shell";
import {
  ACCOUNT_STATUS_LABEL,
  formatDate,
  formatDateTime,
  formatNumber,
  MODERATION_LABEL,
  VISIBILITY_LABEL,
} from "@/components/format";
import { Section } from "@/components/section";
import { ACCOUNT_TONE, CARD, Crumbs, MODERATION_TONE, Pill, VISIBILITY_TONE } from "@/components/studio/bits";
import { getAdminUser } from "@/lib/server/admin";

export const metadata: Metadata = {
  title: "ผู้ใช้ — ผู้ดูแลระบบ",
  robots: { index: false },
};

export default function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <AdminShell section="/admin/users" title="ข้อมูลผู้ใช้" next="/admin/users">
      <UserDetail id={params.then((p) => p.id)} />
    </AdminShell>
  );
}

async function UserDetail({ id }: { id: Promise<string> }) {
  const u = await getAdminUser(await id);
  if (!u) notFound();
  const name = u.displayName || (u.username ? `@${u.username}` : u.email) || "ไม่มีชื่อ";
  const activeSanctions = u.sanctions.filter((s) => s.active);

  return (
    <>
      <Crumbs items={[{ href: "/admin/users", label: "ผู้ใช้" }, { label: name }]} />
      <section className={`${CARD} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold leading-[1.4] lg:text-[22px]">{name}</h2>
          <Pill tone={ACCOUNT_TONE[u.status]}>{ACCOUNT_STATUS_LABEL[u.status]}</Pill>
          {u.verified && <Pill tone="primary">verified</Pill>}
          {u.isAdmin && <Pill tone="primary">admin</Pill>}
        </div>
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm leading-[1.5]">
          <dt className="text-muted">อีเมล</dt>
          <dd className="break-all">{u.email ?? "—"}</dd>
          <dt className="text-muted">ชื่อผู้ใช้</dt>
          <dd>{u.username ? `@${u.username}` : "—"}</dd>
          <dt className="text-muted">user id</dt>
          <dd className="break-all font-mono text-xs">{u.id}</dd>
          <dt className="text-muted">สมัครเมื่อ</dt>
          <dd>{formatDate(u.createdAt)}</dd>
          <dt className="text-muted">coin</dt>
          <dd>
            {u.wallet ? `${formatNumber(u.wallet.purchased)} (เติม) + ${formatNumber(u.wallet.welcome)} (welcome)` : "—"}
          </dd>
          <dt className="text-muted">รายงานที่เปิด</dt>
          <dd>{u.openReports > 0 ? <Link href="/admin/reports?type=user" className="text-hot hover:underline">{u.openReports}</Link> : 0}</dd>
          {u.bio && (
            <>
              <dt className="text-muted">แนะนำตัว</dt>
              <dd className="whitespace-pre-line">{u.bio}</dd>
            </>
          )}
        </dl>
        {!u.isAdmin && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <AdminAction spec={{ kind: "verify", userId: u.id, verified: !u.verified }} />
            {u.status === "active" && <AdminAction spec={{ kind: "suspend", userId: u.id }} />}
            {u.status !== "banned" && <AdminAction spec={{ kind: "ban", userId: u.id }} />}
          </div>
        )}
      </section>

      <Section title="ประวัติการลงโทษ">
        {u.sanctions.length === 0 ? (
          <p className="rounded-[20px] bg-surface px-4 py-8 text-center text-sm text-muted">ไม่มี</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-surface">
            {u.sanctions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-5">
                <Pill tone={s.kind === "ban" ? "hot" : "gold"}>{s.kind === "ban" ? "แบน" : "ระงับ"}</Pill>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-[15px] leading-[1.4]">{s.reason}</p>
                  <p className="text-xs leading-[1.4] text-muted">
                    {formatDateTime(s.startsAt)} → {s.endsAt ? formatDateTime(s.endsAt) : "ไม่มีกำหนด"}
                    {s.liftedAt && ` · ปลดเมื่อ ${formatDateTime(s.liftedAt)}`}
                    {!s.active && !s.liftedAt && " · ครบกำหนดแล้ว"}
                  </p>
                </div>
                {s.active && <AdminAction spec={{ kind: "lift", sanctionId: s.id }} />}
              </li>
            ))}
          </ul>
        )}
        {activeSanctions.length > 1 && (
          <p className="text-xs text-muted">มีบทลงโทษที่มีผลอยู่ {activeSanctions.length} รายการ ต้องปลดทุกอันจึงกลับเป็นปกติ</p>
        )}
      </Section>

      <Section title={`ผลงาน (${u.series.length})`}>
        {u.series.length === 0 ? (
          <p className="rounded-[20px] bg-surface px-4 py-8 text-center text-sm text-muted">ไม่มีผลงาน</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-surface">
            {u.series.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-5">
                <Link href={`/admin/series?q=${s.id}`} className="flex-1 truncate text-[15px] leading-[1.4] hover:underline">
                  {s.title}
                </Link>
                <Pill tone={VISIBILITY_TONE[s.visibility]}>{VISIBILITY_LABEL[s.visibility]}</Pill>
                {s.moderation !== "active" && <Pill tone={MODERATION_TONE[s.moderation]}>{MODERATION_LABEL[s.moderation]}</Pill>}
                {s.deleted && <Pill tone="hot">ถูกลบ</Pill>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
