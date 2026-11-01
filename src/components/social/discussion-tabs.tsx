"use client";

import { useEffect, useState, type ReactNode } from "react";

type Tab = { key: string; label: string; count: number; panel: ReactNode };

/**
 * Section with tabs; panels are rendered on the server and passed in. The
 * section is the `#comments` anchor (reply notifications link there), which
 * also selects the comments tab.
 */
export function DiscussionTabs({ title, tabs }: { title: string; tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].key);
  const hasComments = tabs.some((t) => t.key === "comments");

  useEffect(() => {
    const onHash = () => {
      if (hasComments && window.location.hash === "#comments") setActive("comments");
    };
    // Deferred: the hash is only known on the client (avoids a hydration mismatch).
    const id = requestAnimationFrame(onHash);
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("hashchange", onHash);
    };
  }, [hasComments]);

  return (
    <section id="comments" aria-labelledby="discussion-title" className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="discussion-title" className="text-lg font-bold leading-[1.4] lg:text-[22px]">
          {title}
        </h2>
        <div role="tablist" aria-label={title} className="flex gap-1.5 rounded-[20px] bg-surface p-1">
          {tabs.map((t) => {
            const selected = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`discussion-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`discussion-panel-${t.key}`}
                onClick={() => setActive(t.key)}
                className={`rounded-2xl px-3 py-1.5 text-[13px] leading-[1.4] transition-colors lg:px-4 lg:text-sm ${
                  selected ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"
                }`}
              >
                {t.label}
                <span className={selected ? "text-white/80" : "text-faint"}> {t.count.toLocaleString("th-TH")}</span>
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((t) => (
        // Keep both mounted so drafts survive switching tabs.
        <div
          key={t.key}
          id={`discussion-panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`discussion-tab-${t.key}`}
          hidden={t.key !== active}
        >
          {t.panel}
        </div>
      ))}
    </section>
  );
}
