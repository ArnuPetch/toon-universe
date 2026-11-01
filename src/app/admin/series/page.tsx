import type { Metadata } from "next";
import Link from "next/link";
import { AdminAction } from "@/components/admin/admin-action";
import { AdminShell } from "@/components/admin/shell";
import { LinkTabs } from "@/components/browse/link-tabs";
import { Cover } from "@/components/cover";
import { AGE_RATING_LABEL, formatDateTime, MODERATION_LABEL, VISIBILITY_LABEL } from "@/components/format";
import { INPUT, PRIMARY_BUTTON } from "@/components/form-styles";
import { EmptyState } from "@/components/page";
import { MODERATION_TONE, Pill, VISIBILITY_TONE } from "@/components/studio/bits";
import { findSeries, type SeriesFilter } from "@/lib/server/admin";

// Content review: search any series (drafts / held / removed too), close it
// for review, reopen it, or take it down.

export const metadata: Metadata = {
  title: "ผลงาน — ผู้ดูแลระบบ",
  robots: { index: false },
};

const FILTERS: { value: SeriesFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "under_review", label: "ปิดตรวจสอบ" },
  { value: "removed", label: "ถูกถอด / ลบ" },
];

type Search = { q?: string; filter?: string };

export default function AdminSeriesPage({ searchParams }: PageProps<"/admin/series">) {
  return (
    <AdminShell section="/admin/series" title="ผลงาน" sub="ค้นหาด้วยชื่อเรื่อง ลิงก์ (slug) หรือเลข id" next="/admin/series">
      <SeriesList search={searchParams as Promise<Search>} />
    </AdminShell>
  );
}

async function SeriesList({ search }: { search: Promise<Search> }) {
  const sp = await search;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const filter = FILTERS.find((f) => f.value === sp.filter)?.value ?? "all";
  const rows = await findSeries(q, filter);
  const href = (f: SeriesFilter) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("filter", f);
    const s = p.toString();
    return `/admin/series${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <form action="/admin/series" role="search" className="flex gap-2">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <input name="q" type="search" defaultValue={q} placeholder="ค้นหาผลงาน" aria-label="ค้นหาผลงาน" className={INPUT} />
        <button type="submit" className={PRIMARY_BUTTON}>
          ค้นหา
        </button>
      </form>
      <LinkTabs label="ตัวกรอง" options={FILTERS.map((f) => ({ href: href(f.value), label: f.label, current: f.value === filter }))} />
      {rows.length === 0 ? (
        <EmptyState title="ไม่พบผลงาน" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => {
            const live = !s.deleted && s.moderation !== "removed";
            return (
              <li key={s.id} className="flex flex-col gap-4 rounded-[20px] bg-surface p-4 lg:flex-row lg:items-center lg:p-5">
                <div className="flex min-w-0 flex-1 gap-4">
                  <Cover id={s.id} coverKey={s.coverKey} title={s.title} className="aspect-[3/4] w-16 shrink-0 rounded-lg" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Pill tone={VISIBILITY_TONE[s.visibility]}>{VISIBILITY_LABEL[s.visibility]}</Pill>
                      <Pill tone={MODERATION_TONE[s.moderation]}>{MODERATION_LABEL[s.moderation]}</Pill>
                      {s.deleted && <Pill tone="hot">ถูกลบ</Pill>}
                      <Pill>{AGE_RATING_LABEL[s.ageRating]}</Pill>
                    </div>
                    <p className="truncate text-[15px] font-semibold leading-[1.4]">
                      {s.visibility === "published" && s.moderation === "active" && !s.deleted ? (
                        <Link href={`/series/${s.slug}`} className="hover:underline">
                          {s.title}
                        </Link>
                      ) : (
                        s.title
                      )}
                    </p>
                    <p className="text-xs leading-[1.4] text-muted">
                      #{s.id} ·{" "}
                      {s.uploader ? (
                        <Link href={`/admin/users/${s.uploader.id}`} className="hover:underline">
                          {s.uploader.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {s.hold && ` · ปิดตรวจตั้งแต่ ${formatDateTime(s.hold.startedAt)} — ${s.hold.reason}`}
                    </p>
                  </div>
                </div>
                {live && (
                  <div className="flex flex-wrap gap-2">
                    {s.moderation === "active" && <AdminAction spec={{ kind: "hold", seriesId: s.id }} />}
                    {s.moderation === "under_review" && <AdminAction spec={{ kind: "release", seriesId: s.id }} />}
                    <AdminAction spec={{ kind: "takedown", seriesId: s.id }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
