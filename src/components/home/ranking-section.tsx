"use client";

import { useState, type ReactNode } from "react";
import { Section } from "./section";

type Period = "day" | "week" | "month";

const TABS: { period: Period; label: string }[] = [
  { period: "day", label: "รายวัน" },
  { period: "week", label: "รายสัปดาห์" },
  { period: "month", label: "รายเดือน" },
];

/**
 * All three periods are rendered on the server and passed in as ready-made
 * lists, so switching tabs is instant and needs no request.
 */
export function RankingSection({ lists }: { lists: Record<Period, ReactNode | null> }) {
  const [period, setPeriod] = useState<Period>("day");
  const current = lists[period];

  return (
    <Section
      title="Ranking"
      aside={
        <div role="tablist" aria-label="ช่วงเวลา" className="flex gap-1.5 rounded-[20px] bg-surface p-1">
          {TABS.map((tab) => {
            const selected = tab.period === period;
            return (
              <button
                key={tab.period}
                type="button"
                role="tab"
                id={`rank-tab-${tab.period}`}
                aria-selected={selected}
                aria-controls="rank-panel"
                onClick={() => setPeriod(tab.period)}
                className={`rounded-2xl px-3 py-1.5 text-[13px] leading-[1.4] transition-colors lg:px-4 lg:text-sm ${
                  selected ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div id="rank-panel" role="tabpanel" aria-labelledby={`rank-tab-${period}`}>
        {current ?? (
          <p className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted">ยังไม่มีข้อมูลในช่วงนี้</p>
        )}
      </div>
    </Section>
  );
}
