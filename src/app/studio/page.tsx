import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { Cover } from "@/components/cover";
import { formatDate, formatNumber, MODERATION_LABEL, VISIBILITY_LABEL } from "@/components/format";
import { ChevronRightIcon, CoinIcon } from "@/components/icons";
import { EmptyState, PageMain, PageTitle, SignInPrompt } from "@/components/page";
import { Section, SectionSkeleton } from "@/components/section";
import { MODERATION_TONE, Pill, StatTile, StudioNav, VISIBILITY_TONE } from "@/components/studio/bits";
import { TopBar } from "@/components/top-bar";
import { getStudioOverview, type StudioSeriesRow } from "@/lib/server/studio";

// Uploader studio home: totals, earnings at a glance, own series list.

export const metadata: Metadata = {
  title: "สตูดิโอ — Toon Universe",
  robots: { index: false },
};

export default function StudioPage() {
  return (
    <>
      <TopBar />
      <PageMain>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageTitle sub="จัดการผลงาน ตอน ราคา และดูสถิติของคุณ">สตูดิโอ</PageTitle>
          <Link
            href="/studio/series/new"
            className="flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            + สร้างเรื่องใหม่
          </Link>
        </div>
        <StudioNav current="/studio" />
        <Suspense
          fallback={
            <>
              <SectionSkeleton className="h-[104px] rounded-[20px]" />
              <SectionSkeleton className="h-[420px] rounded-[20px]" />
            </>
          }
        >
          <Overview />
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}

async function Overview() {
  const data = await getStudioOverview();
  if (!data) return <SignInPrompt next="/studio" text="เข้าสู่ระบบเพื่ออัพโหลดและจัดการผลงานของคุณ" />;
  const { totals, balance, series } = data;

  return (
    <>
      {data.accountStatus !== "active" && (
        <p role="status" className="rounded-xl bg-hot/10 px-4 py-3 text-sm leading-[1.4] text-hot">
          บัญชีถูก{data.accountStatus === "suspended" ? "ระงับชั่วคราว" : "แบน"} — แก้ไขหรือเผยแพร่ผลงานไม่ได้ในขณะนี้
        </p>
      )}

      <section aria-label="สรุป" className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-5">
        <StatTile label="ยอดวิวทั้งหมด" value={formatNumber(totals.views)} sub={`30 วัน: ${formatNumber(totals.views30d)}`} />
        <StatTile label="ผู้ติดตาม" value={formatNumber(totals.followers)} />
        <StatTile label="ยอดซื้อตอน" value={formatNumber(totals.unlocks)} sub={`30 วัน: ${formatNumber(totals.unlocks30d)}`} />
        <StatTile
          label="รายได้ (coin = บาท)"
          value={formatNumber(totals.revenue)}
          sub={`30 วัน: ${formatNumber(totals.revenue30d)}`}
          accent
        />
        <Link
          href="/studio/earnings"
          className="col-span-2 flex flex-col gap-1 rounded-[20px] bg-surface p-4 transition-colors hover:bg-surface-2 lg:col-span-1 lg:p-5"
        >
          <span className="flex items-center justify-between text-[13px] leading-[1.4] text-muted lg:text-sm">
            ถอนได้ตอนนี้
            <ChevronRightIcon size={16} />
          </span>
          <span className="flex items-center gap-1.5 text-xl font-bold leading-[1.3] text-gold lg:text-2xl">
            <CoinIcon className="size-5" />
            {formatNumber(balance.withdrawable)}
          </span>
          <span className="text-xs leading-[1.4] text-faint">รอครบ 30 วัน: {formatNumber(balance.waiting)}</span>
        </Link>
      </section>

      <Section title={`ผลงานของฉัน (${series.length})`}>
        {series.length === 0 ? (
          <EmptyState
            title="ยังไม่มีผลงาน"
            text="สร้างเรื่องแรก เพิ่มตอน แล้วกดเผยแพร่เมื่อพร้อม"
            action={{ href: "/studio/series/new", label: "สร้างเรื่องใหม่" }}
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2 lg:gap-5">
            {series.map((s) => (
              <li key={s.id}>
                <SeriesRow s={s} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function SeriesRow({ s }: { s: StudioSeriesRow }) {
  return (
    <Link
      href={`/studio/series/${s.id}`}
      className="flex gap-4 rounded-[20px] bg-surface p-3 transition-colors hover:bg-surface-2 lg:p-4"
    >
      <Cover id={s.id} coverKey={s.coverKey} title={s.title} className="aspect-[3/4] w-[76px] shrink-0 rounded-xl lg:w-[92px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={VISIBILITY_TONE[s.visibility]}>{VISIBILITY_LABEL[s.visibility]}</Pill>
          {s.moderation !== "active" && <Pill tone={MODERATION_TONE[s.moderation]}>{MODERATION_LABEL[s.moderation]}</Pill>}
        </div>
        <p className="truncate text-[15px] font-semibold leading-[1.4] lg:text-base">{s.title}</p>
        <dl className="grid grid-cols-4 gap-2 text-xs leading-[1.4]">
          <Stat label="ตอน" value={s.episodeCount} />
          <Stat label="วิว" value={s.stats.views} />
          <Stat label="ติดตาม" value={s.stats.followers} />
          <Stat label="รายได้" value={s.stats.revenue} gold />
        </dl>
        <p className="text-xs leading-[1.4] text-faint">
          {s.lastEpisodeAt ? `ตอนล่าสุด ${formatDate(s.lastEpisodeAt)}` : `แก้ไขล่าสุด ${formatDate(s.updatedAt)}`}
        </p>
      </div>
      <ChevronRightIcon size={18} className="shrink-0 self-center text-muted" />
    </Link>
  );
}

function Stat({ label, value, gold }: { label: string; value: number; gold?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-faint">{label}</dt>
      <dd className={`font-semibold ${gold ? "text-gold" : "text-text-2"}`}>{formatNumber(value)}</dd>
    </div>
  );
}
