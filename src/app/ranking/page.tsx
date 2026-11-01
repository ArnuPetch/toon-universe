import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { LinkTabs } from "@/components/browse/link-tabs";
import { formatDate, formatViews } from "@/components/format";
import { RankItem } from "@/components/home/cards";
import { FireIcon, StarIcon } from "@/components/icons";
import { EmptyState, PageMain, PageTitle } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getRanking, type RankingRow } from "@/lib/server/browse";
import type { RankingKind, RankingPeriod } from "@/lib/server/ranking";

// Ranking: views / rating / trending / new × day / week / month / all.
// ?kind=&period= — the Home page links here with ?kind=trending.

export const metadata: Metadata = {
  title: "Ranking — Toon Universe",
  description: "อันดับมังงะ มังฮวา ยอดนิยม คะแนนสูง และกำลังมาแรง",
};

type Kind = Exclude<RankingKind, "updated">;
const KINDS: { kind: Kind; label: string }[] = [
  { kind: "views", label: "ยอดวิว" },
  { kind: "rating", label: "คะแนนรีวิว" },
  { kind: "trending", label: "กำลังมาแรง" },
  { kind: "new", label: "มาใหม่" },
];
const PERIODS: { period: RankingPeriod; label: string }[] = [
  { period: "day", label: "รายวัน" },
  { period: "week", label: "รายสัปดาห์" },
  { period: "month", label: "รายเดือน" },
  { period: "all", label: "ทั้งหมด" },
];
const DEFAULT_PERIOD: Record<Kind, RankingPeriod> = { views: "week", rating: "month", trending: "week", new: "month" };

function parse(sp: Record<string, string | string[] | undefined>) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const kind = KINDS.find((k) => k.kind === first(sp.kind))?.kind ?? "views";
  let period = PERIODS.find((p) => p.period === first(sp.period))?.period ?? DEFAULT_PERIOD[kind];
  // Trending compares with the previous window; "all" has none.
  if (kind === "trending" && period === "all") period = "month";
  return { kind, period };
}

function href(kind: Kind, period: RankingPeriod) {
  const sp = new URLSearchParams();
  if (kind !== "views") sp.set("kind", kind);
  if (period !== DEFAULT_PERIOD[kind]) sp.set("period", period);
  const qs = sp.toString();
  return qs ? `/ranking?${qs}` : "/ranking";
}

export default function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const params = searchParams.then(parse);
  return (
    <>
      <TopBar active="/ranking" />
      <PageMain>
        <PageTitle>Ranking</PageTitle>
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <SectionSkeleton className="h-11 w-full max-w-[460px] rounded-[20px]" />
              <SectionSkeleton className="h-[880px] lg:h-[880px]" />
            </div>
          }
        >
          {params.then(({ kind, period }) => (
            <RankingContent kind={kind} period={period} />
          ))}
        </Suspense>
      </PageMain>
      <BottomTabBar active="/ranking" />
    </>
  );
}

async function RankingContent({ kind, period }: { kind: Kind; period: RankingPeriod }) {
  const rows = await getRanking(kind, period);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <LinkTabs
          label="ประเภทอันดับ"
          options={KINDS.map((k) => ({ href: href(k.kind, DEFAULT_PERIOD[k.kind]), label: k.label, current: k.kind === kind }))}
        />
        <LinkTabs
          label="ช่วงเวลา"
          options={PERIODS.filter((p) => kind !== "trending" || p.period !== "all").map((p) => ({
            href: href(kind, p.period),
            label: p.label,
            current: p.period === period,
          }))}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีอันดับในช่วงนี้" text="ลองเลือกช่วงเวลาที่ยาวขึ้นดูนะ" />
      ) : (
        <ol
          className="grid gap-3 lg:grid-flow-col lg:grid-cols-2 lg:gap-x-5"
          style={{ gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)` }}
        >
          {rows.map((row) => (
            <RankItem key={row.id} item={row} metric={<Metric kind={kind} row={row} />} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Metric({ kind, row }: { kind: Kind; row: RankingRow }) {
  switch (kind) {
    case "rating":
      return (
        <span className="flex items-center gap-1 text-text-2">
          <StarIcon size={14} className="text-gold" />
          <span className="sr-only">คะแนน </span>
          {row.ratingAvg?.toFixed(1) ?? "-"}
          <span className="text-muted">({row.ratingCount.toLocaleString("th-TH")})</span>
        </span>
      );
    case "trending":
      return (
        <span className="flex items-center gap-1">
          <FireIcon size={14} />
          {formatViews(row.views)}
        </span>
      );
    case "new":
      return row.publishedAt ? formatDate(row.publishedAt) : null;
    default:
      return formatViews(row.views);
  }
}
