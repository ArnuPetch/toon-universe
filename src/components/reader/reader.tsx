"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveReadingPreference, saveReadingProgress } from "@/app/actions/reader";
import type { ReaderPage, ReaderPreference } from "@/lib/server/series";
import { ChevronLeftIcon, ChevronRightIcon, SettingsIcon } from "../icons";

const SAVE_DELAY_MS = 1500;

/**
 * Episode pages in vertical (scroll) or paged (flip) mode, LTR or RTL.
 * Saves the current page as reading progress and the mode per series
 * (both no-ops when signed out).
 */
export function Reader({
  seriesId,
  episodeId,
  pages,
  initialPreference,
  startPage,
  signedIn,
}: {
  seriesId: number;
  episodeId: number;
  pages: ReaderPage[];
  initialPreference: ReaderPreference;
  startPage: number;
  signedIn: boolean;
}) {
  const [pref, setPref] = useState(initialPreference);
  const [page, setPage] = useState(Math.min(Math.max(1, startPage), Math.max(1, pages.length)));
  const [settingsOpen, setSettingsOpen] = useState(false);

  // --- progress: save on open, then debounced on every page change ---
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveReadingProgress(episodeId, page), SAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [signedIn, episodeId, page]);

  const updatePref = (next: ReaderPreference) => {
    setPref(next);
    if (signedIn) void saveReadingPreference(seriesId, next.mode, next.direction);
  };

  if (pages.length === 0) {
    return (
      <p className="mx-auto max-w-[440px] rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted">
        ตอนนี้ยังไม่มีหน้า
      </p>
    );
  }

  return (
    <div>
      <div className="fixed bottom-[84px] right-4 z-30 lg:bottom-[88px] lg:right-12">
        {settingsOpen && (
          <ReaderSettings pref={pref} onChange={updatePref} onClose={() => setSettingsOpen(false)} />
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          aria-controls="reader-settings"
          aria-label="ตั้งค่าการอ่าน"
          className="grid size-12 place-items-center rounded-full bg-surface-2/95 text-text-2 shadow-lg backdrop-blur transition-colors hover:text-text"
        >
          <SettingsIcon size={20} />
        </button>
      </div>
      {pref.mode === "vertical" ? (
        <VerticalPages pages={pages} startPage={page} onPageChange={setPage} />
      ) : (
        <PagedPages pages={pages} page={page} rtl={pref.direction === "rtl"} onPageChange={setPage} />
      )}
    </div>
  );
}

function ReaderSettings({
  pref,
  onChange,
  onClose,
}: {
  pref: ReaderPreference;
  onChange: (p: ReaderPreference) => void;
  onClose: () => void;
}) {
  return (
    <div
      id="reader-settings"
      role="dialog"
      aria-label="ตั้งค่าการอ่าน"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="absolute bottom-[60px] right-0 flex w-[260px] flex-col gap-4 rounded-xl bg-surface-2 p-4 shadow-2xl"
    >
      <Choice
        label="รูปแบบการอ่าน"
        value={pref.mode}
        options={[
          { value: "vertical", label: "เลื่อนลง" },
          { value: "paged", label: "พลิกหน้า" },
        ]}
        onChange={(mode) => onChange({ ...pref, mode })}
      />
      {pref.mode === "paged" && (
        <Choice
          label="ทิศทาง"
          value={pref.direction}
          options={[
            { value: "ltr", label: "ซ้าย → ขวา" },
            { value: "rtl", label: "ขวา → ซ้าย" },
          ]}
          onChange={(direction) => onChange({ ...pref, direction })}
        />
      )}
      <p className="text-[12px] leading-[1.4] text-faint">จำค่าแยกตามเรื่อง</p>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] leading-[1.4] text-muted">{label}</legend>
      <div className="flex gap-1.5 rounded-[20px] bg-bg p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-2xl px-3 py-1.5 text-[13px] leading-[1.4] transition-colors ${
              o.value === value ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * One page image. Pages live in R2 and will be served through short-lived
 * signed URLs; until R2 is wired up this renders a sized placeholder.
 * TODO: <img src={signedUrl}> once episode pages are served from R2.
 */
function PageImage({ page, className = "" }: { page: ReaderPage; className?: string }) {
  const ratio = page.width && page.height ? `${page.width} / ${page.height}` : "800 / 1200";
  return (
    <div
      role="img"
      aria-label={`หน้า ${page.number}`}
      style={{ aspectRatio: ratio }}
      className={`grid w-full place-items-center bg-linear-to-b from-surface to-surface-2 ${className}`}
    >
      <span aria-hidden="true" className="text-[40px] font-bold text-white/15 lg:text-[64px]">
        {page.number}
      </span>
    </div>
  );
}

function VerticalPages({
  pages,
  startPage,
  onPageChange,
}: {
  pages: ReaderPage[];
  startPage: number;
  onPageChange: (page: number) => void;
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // Jump to where the reader left off (once).
  const initial = useRef(startPage);
  useEffect(() => {
    if (initial.current > 1) refs.current[initial.current - 1]?.scrollIntoView({ block: "start" });
  }, []);

  // The page crossing the middle of the viewport is the current one.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onPageChange(Number((e.target as HTMLElement).dataset.page));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const el of refs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [pages, onPageChange]);

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col">
      {pages.map((p, i) => (
        <div
          key={p.number}
          data-page={p.number}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <PageImage page={p} />
        </div>
      ))}
    </div>
  );
}

function PagedPages({
  pages,
  page,
  rtl,
  onPageChange,
}: {
  pages: ReaderPage[];
  page: number;
  rtl: boolean;
  onPageChange: (page: number) => void;
}) {
  const total = pages.length;
  const go = useCallback(
    (delta: number) => onPageChange(Math.min(total, Math.max(1, page + delta))),
    [onPageChange, page, total],
  );
  // Left side = previous in LTR, next in RTL (manga).
  const left = useCallback(() => go(rtl ? 1 : -1), [go, rtl]);
  const right = useCallback(() => go(rtl ? -1 : 1), [go, rtl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea")) return;
      if (e.key === "ArrowLeft") left();
      else if (e.key === "ArrowRight") right();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [left, right]);

  const current = pages[page - 1];
  const navBtn =
    "grid size-11 place-items-center rounded-full bg-surface text-text-2 transition-colors hover:text-text disabled:opacity-30";
  const leftDisabled = rtl ? page >= total : page <= 1;
  const rightDisabled = rtl ? page <= 1 : page >= total;

  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-4">
      <div className="relative w-full max-w-[min(800px,calc((100dvh-180px)*2/3))]">
        {current && <PageImage key={current.number} page={current} className="animate-[fade_200ms_ease-out]" />}
        {/* Tap zones: left / right half of the page */}
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={left} className="absolute inset-y-0 left-0 w-1/2 cursor-w-resize" />
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={right} className="absolute inset-y-0 right-0 w-1/2 cursor-e-resize" />
      </div>
      <div className="flex items-center gap-4" dir="ltr">
        <button type="button" onClick={left} disabled={leftDisabled} aria-label={rtl ? "หน้าถัดไป" : "หน้าก่อนหน้า"} className={navBtn}>
          <ChevronLeftIcon size={22} />
        </button>
        <p aria-live="polite" className="min-w-[72px] text-center text-sm text-text-2">
          {page} / {total}
        </p>
        <button type="button" onClick={right} disabled={rightDisabled} aria-label={rtl ? "หน้าก่อนหน้า" : "หน้าถัดไป"} className={navBtn}>
          <ChevronRightIcon size={22} />
        </button>
      </div>
    </div>
  );
}
