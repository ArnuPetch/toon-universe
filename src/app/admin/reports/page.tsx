import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/admin/admin-action";
import { ChipRow, LinkTabs } from "@/components/browse/link-tabs";
import { AdminShell } from "@/components/admin/shell";
import {
  ACCOUNT_STATUS_LABEL,
  formatDateTime,
  MODERATION_LABEL,
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_TARGET_LABEL,
} from "@/components/format";
import { EmptyState } from "@/components/page";
import { ACCOUNT_TONE, CARD, MODERATION_TONE, Pill } from "@/components/studio/bits";
import { getReports, type ReportGroup, type ReportStatus, type ReportTarget } from "@/lib/server/admin";

export const metadata: Metadata = {
  title: "รายงาน — ผู้ดูแลระบบ",
  robots: { index: false },
};

const STATUSES: ReportStatus[] = ["open", "resolved", "dismissed"];
const TYPES: ReportTarget[] = ["series", "comment", "review", "user"];

type Search = { status?: string; type?: string };

function href(s: { status: ReportStatus; type: ReportTarget | null }) {
  const q = new URLSearchParams();
  if (s.status !== "open") q.set("status", s.status);
  if (s.type) q.set("type", s.type);
  const qs = q.toString();
  return `/admin/reports${qs ? `?${qs}` : ""}`;
}

export default function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <AdminShell section="/admin/reports" title="รายงาน" sub="รายการเดียวกันที่ถูกรายงานหลายครั้งรวมเป็นการ์ดเดียว" next="/admin/reports">
      <Reports search={searchParams as Promise<Search>} />
    </AdminShell>
  );
}

async function Reports({ search }: { search: Promise<Search> }) {
  const sp = await search;
  const status = STATUSES.find((s) => s === sp.status) ?? "open";
  const type = TYPES.find((t) => t === sp.type) ?? null;
  const groups = await getReports(status, type);

  return (
    <>
      <div className="flex flex-col gap-3">
        <LinkTabs
          label="สถานะรายงาน"
          options={STATUSES.map((s) => ({ href: href({ status: s, type }), label: REPORT_STATUS_LABEL[s], current: s === status }))}
        />
        <ChipRow
          label="ประเภท"
          options={[
            { href: href({ status, type: null }), label: "ทั้งหมด", current: type === null },
            ...TYPES.map((t) => ({ href: href({ status, type: t }), label: REPORT_TARGET_LABEL[t], current: t === type })),
          ]}
        />
      </div>
      {groups.length === 0 ? (
        <EmptyState title={status === "open" ? "ไม่มีรายงานที่รอจัดการ" : "ไม่มีรายการ"} />
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((g) => (
            <li key={g.key}>
              <ReportCard g={g} open={status === "open"} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReportCard({ g, open }: { g: ReportGroup; open: boolean }) {
  const reportIds = g.reports.map((r) => r.id);
  const reasons = [...new Set(g.reports.map((r) => r.reason))];

  return (
    <article className={`${CARD} flex flex-col gap-4`}>
      <header className="flex flex-wrap items-center gap-2">
        <Pill tone="primary">{REPORT_TARGET_LABEL[g.type]}</Pill>
        {reasons.map((r) => (
          <Pill key={r} tone="hot">
            {REPORT_REASON_LABEL[r]}
          </Pill>
        ))}
        <span className="text-[13px] leading-[1.4] text-muted">
          {g.reports.length > 1 ? `ถูกรายงาน ${g.reports.length} ครั้ง` : "รายงาน 1 ครั้ง"}
        </span>
      </header>

      <Target g={g} />

      <details className="group text-sm leading-[1.5]">
        <summary className="cursor-pointer text-[13px] text-muted hover:text-text">รายละเอียดรายงาน</summary>
        <ul className="mt-2 flex flex-col gap-2">
          {g.reports.map((r) => (
            <li key={r.id} className="rounded-xl bg-surface-2 px-3 py-2">
              <p className="text-[13px] text-muted">
                {r.reporter} · {formatDateTime(r.createdAt)} · {REPORT_REASON_LABEL[r.reason]}
              </p>
              {r.details && <p className="whitespace-pre-line text-text-2">{r.details}</p>}
              {r.resolvedAt && (
                <p className="text-[13px] text-muted">
                  ปิดเมื่อ {formatDateTime(r.resolvedAt)}
                  {r.resolutionNote && ` — ${r.resolutionNote}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>

      {open && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <TargetActions g={g} reportIds={reportIds} />
          <AdminAction spec={{ kind: "dismiss", reportIds }} />
        </div>
      )}
    </article>
  );
}

function Target({ g }: { g: ReportGroup }) {
  if (g.content) {
    const c = g.content;
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
        <p className="flex flex-wrap items-center gap-2 text-[13px] leading-[1.4] text-muted">
          {c.author ? (
            <Link href={`/admin/users/${c.author.id}`} className="font-semibold text-text-2 hover:underline">
              {c.author.name}
            </Link>
          ) : (
            "ผู้ใช้ที่ถูกลบ"
          )}
          {c.author && c.author.status !== "active" && (
            <Pill tone={ACCOUNT_TONE[c.author.status]}>{ACCOUNT_STATUS_LABEL[c.author.status]}</Pill>
          )}
          <span>ใน</span>
          {c.where.href ? (
            <Link href={c.where.href} className="hover:underline">
              {c.where.title}
            </Link>
          ) : (
            c.where.title
          )}
          {c.rating != null && <span className="text-gold">★ {c.rating}</span>}
          {c.isSpoiler && <Pill>สปอยล์</Pill>}
          {c.hidden && <Pill tone="gold">ซ่อนอยู่</Pill>}
          {c.deleted && <Pill>ผู้เขียนลบแล้ว</Pill>}
        </p>
        <p className="whitespace-pre-line text-[15px] leading-[1.6]">{c.body || <span className="text-muted">(ให้คะแนนอย่างเดียว)</span>}</p>
      </div>
    );
  }
  if (g.series) {
    const s = g.series;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-4 text-[15px] leading-[1.4]">
        <Link href={`/admin/series?q=${s.id}`} className="font-semibold hover:underline">
          {s.title}
        </Link>
        <Pill tone={MODERATION_TONE[s.moderation]}>{MODERATION_LABEL[s.moderation]}</Pill>
        {s.deleted && <Pill tone="hot">ถูกลบ</Pill>}
        {s.uploader && (
          <span className="text-[13px] text-muted">
            โดย{" "}
            <Link href={`/admin/users/${s.uploader.id}`} className="text-text-2 hover:underline">
              {s.uploader.name}
            </Link>
          </span>
        )}
        {s.moderation === "active" && !s.deleted && (
          <Link href={`/series/${s.slug}`} className="ml-auto text-[13px] text-primary hover:underline">
            เปิดหน้าเรื่อง
          </Link>
        )}
      </div>
    );
  }
  if (g.user) {
    const u = g.user;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-4 text-[15px] leading-[1.4]">
        <Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">
          {u.name}
        </Link>
        {u.username && <span className="text-[13px] text-muted">@{u.username}</span>}
        <Pill tone={ACCOUNT_TONE[u.status]}>{ACCOUNT_STATUS_LABEL[u.status]}</Pill>
      </div>
    );
  }
  return <p className="text-sm text-muted">เป้าหมายถูกลบไปแล้ว</p>;
}

function TargetActions({ g, reportIds }: { g: ReportGroup; reportIds: number[] }) {
  if (g.content && (g.type === "comment" || g.type === "review")) {
    const author = g.content.author;
    return (
      <>
        {!g.content.hidden && (
          <AdminAction spec={{ kind: "hide", targetType: g.type, targetId: g.content.id, hidden: true }} />
        )}
        {author && author.status === "active" && (
          <AdminAction spec={{ kind: "suspend", userId: author.id, reportIds }} label="ระงับผู้เขียน" />
        )}
        {g.content.hidden && <AdminAction spec={{ kind: "resolve", reportIds }} />}
      </>
    );
  }
  if (g.series && !g.series.deleted) {
    return (
      <>
        {g.series.moderation === "active" && <AdminAction spec={{ kind: "hold", seriesId: g.series.id, reportIds }} />}
        <AdminAction spec={{ kind: "takedown", seriesId: g.series.id, reportIds }} />
        {g.series.moderation !== "active" && <AdminAction spec={{ kind: "resolve", reportIds }} />}
      </>
    );
  }
  if (g.user && g.user.status !== "banned") {
    return (
      <>
        {g.user.status === "active" && <AdminAction spec={{ kind: "suspend", userId: g.user.id, reportIds }} />}
        <AdminAction spec={{ kind: "ban", userId: g.user.id, reportIds }} />
      </>
    );
  }
  return <AdminAction spec={{ kind: "resolve", reportIds }} />;
}
