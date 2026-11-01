import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ListIcon } from "@/components/icons";
import { Reader } from "@/components/reader/reader";
import { UnlockPanel } from "@/components/reader/unlock-panel";
import { SectionSkeleton } from "@/components/section";
import { AgeGate } from "@/components/series/age-gate";
import { DiscussionSkeleton, EpisodeDiscussion } from "@/components/social/discussion";
import { getViewerSummary } from "@/lib/server/home";
import { recordEpisodeView } from "@/lib/server/ranking";
import {
  getEpisodePages,
  getPublicSeriesTitle,
  getReadingPreference,
  getSeries,
  getViewerState,
  type EpisodeItem,
  type SeriesDetail,
} from "@/lib/server/series";

// Reader: /series/[slug]/[number]. Access = owner, free, or an active unlock
// (re-checked by RLS on episode_pages). Serving the pages counts a view.

function parseNumber(raw: string) {
  return /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: PageProps<"/series/[slug]/[number]">): Promise<Metadata> {
  const { slug, number } = await params;
  const s = await getPublicSeriesTitle(slug);
  if (!s || !parseNumber(number)) return { title: "ไม่พบตอน — Toon Universe" };
  return { title: `${s.title} ตอนที่ ${number} — Toon Universe` };
}

export default function EpisodePage({ params }: PageProps<"/series/[slug]/[number]">) {
  return (
    <Suspense fallback={<ReaderSkeleton />}>
      {params.then(({ slug, number }) => (
        <EpisodeContent slug={slug} rawNumber={number} />
      ))}
    </Suspense>
  );
}

function ReaderSkeleton() {
  return (
    <>
      <header className="h-[52px] border-b border-line lg:h-[60px]" />
      <div className="mx-auto w-full max-w-[800px] px-4 pt-4 lg:px-0">
        <SectionSkeleton className="h-[80vh]" />
      </div>
    </>
  );
}

async function EpisodeContent({ slug, rawNumber }: { slug: string; rawNumber: string }) {
  // Never prerender/prefetch the reader: serving it counts a view.
  await connection();
  const number = parseNumber(rawNumber);
  const series = number ? await getSeries(slug) : null;
  const index = series ? series.episodes.findIndex((e) => e.number === number) : -1;
  if (!series || index < 0) notFound();
  const episode = series.episodes[index];
  const prev = series.episodes[index - 1] ?? null;
  const next = series.episodes[index + 1] ?? null;

  const viewer = await getViewerState(series);
  const href = `/series/${series.slug}/${episode.number}`;
  const canRead = viewer.isOwner || episode.price === 0 || viewer.unlocks.has(episode.id);

  let body;
  if (!viewer.meetsAgeRating) {
    body = (
      <div className="px-4 pt-8">
        <AgeGate
          slug={series.slug}
          ageRating={series.ageRating}
          signedIn={viewer.userId != null}
          className="mx-auto bg-surface"
        />
      </div>
    );
  } else if (canRead) {
    const [pages, preference] = await Promise.all([
      getEpisodePages(episode.id),
      getReadingPreference(series),
      // Count the view now that the pages are actually being served.
      recordEpisodeView(episode.id),
    ]);
    const startPage = viewer.progress?.episodeId === episode.id ? viewer.progress.page : 1;
    body = (
      <Reader
        // Remount per episode so page state / scroll position start fresh.
        key={episode.id}
        seriesId={series.id}
        episodeId={episode.id}
        pages={pages}
        initialPreference={preference}
        startPage={startPage}
        signedIn={viewer.userId != null}
      />
    );
  } else {
    const summary = await getViewerSummary();
    body = (
      <div className="px-4 pt-8 lg:pt-12">
        <UnlockPanel
          episodeId={episode.id}
          episodeNumber={episode.number}
          price={episode.price}
          balance={summary?.coins ?? null}
          loginHref={`/login?next=${encodeURIComponent(href)}`}
        />
      </div>
    );
  }

  return (
    <>
      <ReaderHeader series={series} episode={episode} />
      <main className="flex-1 pb-8">
        {body}
        {viewer.meetsAgeRating && (
          <div className="mx-auto w-full max-w-[800px] px-4 pt-10 lg:pt-14">
            <Suspense fallback={<DiscussionSkeleton />}>
              <EpisodeDiscussion series={series} episode={episode} viewer={viewer} canRead={canRead} />
            </Suspense>
          </div>
        )}
      </main>
      <EpisodeNav series={series} prev={prev} next={next} />
    </>
  );
}

function ReaderHeader({ series, episode }: { series: SeriesDetail; episode: EpisodeItem }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-[52px] max-w-[1440px] items-center gap-2 px-2 lg:h-[60px] lg:gap-4 lg:px-12">
        <Link
          href={`/series/${series.slug}`}
          aria-label={`กลับไปหน้าเรื่อง ${series.title}`}
          className="grid size-10 shrink-0 place-items-center rounded-full text-text-2 transition-colors hover:bg-surface hover:text-text"
        >
          <ChevronLeftIcon size={22} />
        </Link>
        <div className="flex min-w-0 flex-col leading-[1.3]">
          <p className="truncate text-[15px] font-semibold lg:text-base">{series.title}</p>
          <h1 className="truncate text-[13px] text-muted">
            ตอนที่ {episode.number}
            {episode.title && ` · ${episode.title}`}
          </h1>
        </div>
        <Link href="/" className="ml-auto hidden shrink-0 text-lg font-bold tracking-tight lg:block">
          <span className="text-primary">Toon</span> Universe
        </Link>
      </div>
    </header>
  );
}

function EpisodeNav({
  series,
  prev,
  next,
}: {
  series: SeriesDetail;
  prev: EpisodeItem | null;
  next: EpisodeItem | null;
}) {
  const base = `/series/${series.slug}`;
  const btn =
    "flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors lg:h-12 lg:px-6 lg:text-[15px]";
  return (
    <nav
      aria-label="ตอนอื่น"
      className="sticky bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-[800px] items-center justify-between gap-2 px-4">
        {prev ? (
          <Link href={`${base}/${prev.number}`} className={`${btn} bg-surface text-text hover:bg-surface-2`}>
            <ChevronLeftIcon size={18} />
            ตอนก่อน
          </Link>
        ) : (
          <span className={`${btn} bg-surface text-faint`} aria-disabled="true">
            <ChevronLeftIcon size={18} />
            ตอนก่อน
          </span>
        )}
        <Link
          href={base}
          aria-label="รายชื่อตอนทั้งหมด"
          className="grid size-11 place-items-center rounded-full bg-surface text-text-2 transition-colors hover:text-text lg:size-12"
        >
          <ListIcon size={20} />
        </Link>
        {next ? (
          <Link href={`${base}/${next.number}`} className={`${btn} bg-primary text-white hover:bg-primary-hover`}>
            ตอนถัดไป
            <ChevronRightIcon size={18} />
          </Link>
        ) : (
          <span className={`${btn} bg-surface text-faint`} aria-disabled="true">
            ตอนถัดไป
            <ChevronRightIcon size={18} />
          </span>
        )}
      </div>
    </nav>
  );
}
