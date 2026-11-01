"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { addToBookshelf } from "@/app/actions/bookshelf";
import { coverUrl } from "@/lib/r2/shared";
import type { HeroSeries } from "@/lib/server/home";
import { coverInitial } from "../cover";
import { SERIES_STATUS_LABEL } from "../format";

const INTERVAL_MS = 6000;


export function HeroCarousel({ items }: { items: HeroSeries[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Fade only when the slide changes, not on the first paint.
  const [changed, setChanged] = useState(false);
  const go = (next: number) => {
    setChanged(true);
    setIndex(next);
  };

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => {
      setChanged(true);
      setIndex((i) => (i + 1) % items.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, items.length]);

  const item = items[index];
  if (!item) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="เรื่องแนะนำ"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative h-[360px] overflow-hidden rounded-[20px] lg:h-[420px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, #0e0e14 0%, #2a1650 45%, #7a3bd6 80%, #c04cfd 100%)",
      }}
    >
      <Slide key={item.id} item={item} animate={changed} />

      {items.length > 1 && (
        <div className="absolute left-5 top-5 flex gap-1.5 lg:left-auto lg:right-12 lg:top-auto lg:bottom-6">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`เรื่องที่ ${i + 1}: ${it.title}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Slide({ item, animate }: { item: HeroSeries; animate: boolean }) {
  const href = `/series/${item.slug}`;
  const first = item.firstEpisode;
  const cover = coverUrl(item.coverKey);

  return (
    <div className={animate ? "animate-[fade_400ms_ease-out]" : undefined}>
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute right-5 top-5 grid h-40 w-[120px] place-items-center overflow-hidden rounded-xl bg-linear-to-b from-[#e7b2ff] to-[#6b2bd6] lg:right-20 lg:top-10 lg:h-[340px] lg:w-[260px] lg:rounded-2xl"
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- resized webp from R2, immutable key
          <img src={cover} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="text-[64px] font-bold leading-none text-white/35 lg:text-[140px]">
            {coverInitial(item.title)}
          </span>
        )}
      </Link>

      <div className="absolute inset-x-5 bottom-5 flex flex-col items-start gap-2.5 lg:inset-x-auto lg:bottom-auto lg:left-12 lg:top-1/2 lg:w-[620px] lg:-translate-y-1/2 lg:gap-3.5">
        {item.genres.length > 0 && (
          <ul className="flex gap-2">
            {item.genres.slice(0, 3).map((g) => (
              <li key={g} className="rounded-xl bg-white/12 px-3 py-1 text-[13px] leading-[1.4] text-tag">
                {g}
              </li>
            ))}
          </ul>
        )}
        <h2 className="line-clamp-1 text-[24px] font-bold leading-[1.25] lg:line-clamp-2 lg:text-[44px]">
          <Link href={href} className="hover:underline">
            {item.title}
          </Link>
        </h2>
        {item.synopsis && (
          <p className="hidden text-base leading-[1.6] text-text-2 lg:line-clamp-2">{item.synopsis}</p>
        )}
        <div className="flex items-center gap-4 text-sm leading-[1.4] text-text-2">
          {item.ratingAvg != null && (
            <span className="flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/star.svg" alt="" width={16} height={16} />
              <span>
                <span className="sr-only">คะแนน </span>
                {item.ratingAvg.toFixed(1)}
              </span>
            </span>
          )}
          {item.latestEpisode != null && <span>ตอนที่ {item.latestEpisode}</span>}
          <span>{SERIES_STATUS_LABEL[item.status]}</span>
        </div>
        <div className="flex gap-3 pt-1.5">
          {first && (
            <Link
              href={`${href}/${first.number}`}
              className="flex h-[42px] items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-hover lg:h-12 lg:px-6 lg:text-base"
            >
              {first.free ? "อ่านตอนแรกฟรี" : "อ่านตอนแรก"}
            </Link>
          )}
          <BookshelfButton seriesId={item.id} />
        </div>
      </div>
    </div>
  );
}

function BookshelfButton({ seriesId }: { seriesId: number }) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  return (
    <button
      type="button"
      disabled={pending || added}
      onClick={() =>
        startTransition(async () => {
          const result = await addToBookshelf(seriesId);
          if (result.ok) setAdded(true);
        })
      }
      className="flex h-[42px] items-center gap-2 rounded-full bg-white/12 px-[18px] text-sm font-semibold text-text transition-colors hover:bg-white/20 disabled:cursor-default disabled:hover:bg-white/12 lg:h-12 lg:px-6 lg:text-base"
    >
      {added ? (
        <span aria-hidden="true" className="text-base leading-none">✓</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/plus.svg" alt="" width={18} height={18} />
      )}
      {added ? "อยู่ในชั้นแล้ว" : "ชั้นหนังสือ"}
    </button>
  );
}
