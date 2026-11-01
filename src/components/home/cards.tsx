import Link from "next/link";
import type { ReactNode } from "react";
import type { ContinueReading, CoverBadge, RankingEntry, SeriesSummary, UpdatedSeries } from "@/lib/server/home";
import { Cover } from "../cover";
import { formatViews, timeAgo } from "../format";

export function ContinueCard({ item }: { item: ContinueReading }) {
  const progress = item.pageCount > 0 ? Math.min(100, Math.round((item.page / item.pageCount) * 100)) : 0;
  return (
    <Link
      href={`/series/${item.slug}/${item.episodeNumber}`}
      className="flex h-[120px] w-[280px] shrink-0 snap-start items-center gap-3.5 rounded-xl bg-surface p-3 transition-colors hover:bg-surface-2 lg:w-auto"
    >
      <Cover id={item.id} title={item.title} className="h-24 w-[72px] shrink-0 rounded-lg" initialClassName="text-[28px] left-2.5 bottom-2.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate text-[15px] font-semibold leading-[1.4]">{item.title}</p>
        <p className="text-[13px] leading-[1.4] text-muted">
          ตอนที่ {item.episodeNumber} · หน้า {item.page}/{item.pageCount}
        </p>
        <div
          role="progressbar"
          aria-label="ความคืบหน้า"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 overflow-hidden rounded-full bg-white/10"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

const RANK_COLOR = ["text-gold", "text-[#d7d7e3]", "text-[#e08a4f]"];

/** `metric` replaces the view count on the right (e.g. rating on the ranking page). */
export function RankItem({ item, className, metric }: { item: RankingEntry; className?: string; metric?: ReactNode }) {
  return (
    <li className={className}>
      <Link
        href={`/series/${item.slug}`}
        className="flex h-20 items-center gap-3 rounded-xl bg-surface px-3 py-2 transition-colors hover:bg-surface-2 lg:h-[84px] lg:gap-4 lg:px-3.5 lg:py-2.5"
      >
        <span
          className={`w-7 shrink-0 text-center text-[22px] font-bold leading-[1.2] lg:w-9 lg:text-[28px] ${
            RANK_COLOR[item.rank - 1] ?? "text-muted"
          }`}
        >
          {item.rank}
        </span>
        <Cover id={item.id} title={item.title} className="h-16 w-12 shrink-0 rounded-[10px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[1.4]">
          <p className="truncate text-[15px] font-semibold">{item.title}</p>
          {item.genres[0] && <p className="text-[13px] text-muted">{item.genres[0]}</p>}
        </div>
        <span className="shrink-0 text-[13px] leading-[1.4] text-muted">{metric ?? formatViews(item.views)}</span>
      </Link>
    </li>
  );
}

export function UpdatedCard({ item, now }: { item: UpdatedSeries; now: number }) {
  return (
    <Link href={`/series/${item.slug}/${item.episodeNumber}`} className="group flex min-w-0 flex-col gap-2">
      <Cover
        id={item.id}
        title={item.title}
        badge={item.badge}
        className="aspect-[3/4] w-full rounded-xl transition-transform group-hover:-translate-y-0.5"
        initialClassName="text-[40px] left-2.5 bottom-2.5"
      />
      <div className="flex flex-col gap-2 leading-[1.4]">
        <p className="truncate text-[15px] font-semibold">{item.title}</p>
        <p className="truncate text-[13px] text-muted">
          ตอนที่ {item.episodeNumber} · {timeAgo(item.releasedAt, now)}
        </p>
      </div>
    </Link>
  );
}

/** Cover + title card (also used for recommendations, where there is no badge). */
export function TrendingCard({ item }: { item: SeriesSummary & { badge?: CoverBadge } }) {
  return (
    <Link
      href={`/series/${item.slug}`}
      className="group flex w-[120px] shrink-0 snap-start flex-col gap-2 lg:w-auto"
    >
      <Cover
        id={item.id}
        title={item.title}
        badge={item.badge}
        className="aspect-[3/4] w-full rounded-xl transition-transform group-hover:-translate-y-0.5"
        initialClassName="text-[40px] left-2.5 bottom-2.5"
      />
      <div className="flex flex-col gap-2 leading-[1.4]">
        <p className="line-clamp-2 text-[15px] font-semibold lg:truncate">{item.title}</p>
        {item.genres[0] && <p className="text-[13px] text-muted">{item.genres[0]}</p>}
      </div>
    </Link>
  );
}
