import Link from "next/link";
import type { BrowseItem } from "@/lib/server/browse";
import { Cover } from "../cover";
import { SERIES_STATUS_LABEL, timeAgo } from "../format";

/**
 * Cover grid for browse results. `show` picks the second line:
 *   - "genre"  → first genre · status (search / genre pages)
 *   - "latest" → latest episode · time ago (updates page; links to the episode)
 */
export function SeriesGrid({
  items,
  now,
  show = "genre",
}: {
  items: BrowseItem[];
  now: number;
  show?: "genre" | "latest";
}) {
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 lg:gap-x-5 lg:gap-y-7">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <BrowseCard item={item} now={now} show={show} />
        </li>
      ))}
    </ul>
  );
}

function BrowseCard({ item, now, show }: { item: BrowseItem; now: number; show: "genre" | "latest" }) {
  const toEpisode = show === "latest" && item.latestEpisode;
  const href = toEpisode ? `/series/${item.slug}/${item.latestEpisode!.number}` : `/series/${item.slug}`;
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-2">
      <Cover
        id={item.id}
        title={item.title}
        badge={item.badge}
        className="aspect-[3/4] w-full rounded-xl transition-transform group-hover:-translate-y-0.5"
        initialClassName="text-[32px] left-2.5 bottom-2.5 lg:text-[40px]"
      />
      <div className="flex flex-col gap-1 leading-[1.4]">
        <p className="line-clamp-2 text-sm font-semibold lg:truncate lg:text-[15px]">{item.title}</p>
        <p className="truncate text-xs text-muted lg:text-[13px]">
          {show === "latest" && item.latestEpisode
            ? `ตอนที่ ${item.latestEpisode.number} · ${timeAgo(item.latestEpisode.releasedAt, now)}`
            : [item.genres[0], SERIES_STATUS_LABEL[item.status]].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export function SeriesGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 lg:gap-x-5 lg:gap-y-7">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-surface" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
