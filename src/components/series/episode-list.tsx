"use client";

import { useState, type ReactNode } from "react";
import { SortIcon } from "../icons";

const PAGE_SIZE = 30;

export type EpisodeGroup = { key: string; heading: string | null; rows: { key: number; node: ReactNode }[] };

/**
 * Episode rows are rendered on the server; this only flips the order
 * (newest first by default, like most readers expect on a series page).
 */
export function EpisodeList({ groups, total }: { groups: EpisodeGroup[]; total: number }) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const sorted = newestFirst
    ? [...groups].reverse().map((g) => ({ ...g, rows: [...g.rows].reverse() }))
    : groups;
  // Long series: show the first PAGE_SIZE rows until "show all" is pressed.
  let budget = showAll ? Infinity : PAGE_SIZE;
  const ordered = sorted
    .map((g) => {
      const rows = g.rows.slice(0, Math.max(0, budget));
      budget -= rows.length;
      return { ...g, rows };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <section aria-labelledby="episodes-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="episodes-heading" className="text-lg font-bold leading-[1.4] lg:text-[22px]">
          ตอนทั้งหมด <span className="text-base font-semibold text-muted lg:text-lg">({total})</span>
        </h2>
        {total > 1 && (
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-[13px] leading-[1.4] text-muted transition-colors hover:text-text lg:text-sm"
          >
            <SortIcon size={16} />
            {newestFirst ? "ล่าสุดก่อน" : "ตอนแรกก่อน"}
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted">ยังไม่มีตอนที่เผยแพร่</p>
      ) : (
        ordered.map((g) => (
          <div key={g.key} className="flex flex-col gap-3">
            {g.heading && <h3 className="text-[15px] font-semibold leading-[1.4] text-text-2">{g.heading}</h3>}
            <ol className="grid gap-3 lg:grid-cols-2 lg:gap-x-5">{g.rows.map((r) => <li key={r.key}>{r.node}</li>)}</ol>
          </div>
        ))
      )}
      {!showAll && total > PAGE_SIZE && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto h-10 rounded-full bg-surface px-6 text-sm font-semibold text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
        >
          ดูทั้งหมด {total} ตอน
        </button>
      )}
    </section>
  );
}
