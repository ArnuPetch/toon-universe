import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { Cover } from "@/components/cover";
import {
  AGE_RATING_LABEL,
  daysLeft,
  formatDate,
  formatViews,
  SERIES_STATUS_LABEL,
} from "@/components/format";
import { TrendingCard } from "@/components/home/cards";
import { CheckIcon, CoinIcon, EyeIcon, HeartIcon, StarIcon } from "@/components/icons";
import { Rail, Section, SectionSkeleton } from "@/components/section";
import { EpisodeList, type EpisodeGroup } from "@/components/series/episode-list";
import { AgeGate } from "@/components/series/age-gate";
import { SeriesActions } from "@/components/series/series-actions";
import { DiscussionSkeleton, SeriesDiscussion } from "@/components/social/discussion";
import { TopBar } from "@/components/top-bar";
import {
  getPublicSeriesTitle,
  getRecommendations,
  getSeries,
  getViewerState,
  type EpisodeItem,
  type SeriesDetail,
  type ViewerState,
} from "@/lib/server/series";

// Series page: info, episode list, follow/bookshelf, recommendations.
// Everything depends on the viewer (RLS, age rating, unlocks), so it streams
// in behind Suspense; the catalog part is cached for signed-out visitors.

export async function generateMetadata({ params }: PageProps<"/series/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getPublicSeriesTitle(slug);
  if (!s) return { title: "ไม่พบเรื่อง — Toon Universe" };
  return { title: `${s.title} — Toon Universe`, description: s.synopsis?.slice(0, 160) ?? undefined };
}

export default function SeriesPage({ params }: PageProps<"/series/[slug]">) {
  return (
    <>
      <TopBar />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 pb-24 pt-4 lg:gap-12 lg:px-12 lg:pb-[139px] lg:pt-8">
        <Suspense fallback={<SeriesSkeleton />}>
          {params.then(({ slug }) => (
            <SeriesContent slug={slug} />
          ))}
        </Suspense>
      </main>
      <BottomTabBar active="" />
    </>
  );
}

function SeriesSkeleton() {
  return (
    <>
      <SectionSkeleton className="h-[420px] rounded-[20px] lg:h-[440px]" />
      <SectionSkeleton className="h-[600px]" />
    </>
  );
}

async function SeriesContent({ slug }: { slug: string }) {
  const series = await getSeries(slug);
  if (!series) notFound();
  const viewer = await getViewerState(series);

  return (
    <>
      {!series.isPublic && (
        <p className="rounded-xl bg-gold/10 px-4 py-3 text-sm leading-[1.4] text-gold">
          เรื่องนี้ยังไม่เปิดให้ผู้อ่านทั่วไปเห็น (ฉบับร่าง / ระหว่างตรวจสอบ) — เห็นเฉพาะคุณ
        </p>
      )}
      <SeriesHeader series={series} viewer={viewer} />
      {viewer.meetsAgeRating && <Episodes series={series} viewer={viewer} />}
      {viewer.meetsAgeRating && (
        <Suspense fallback={<DiscussionSkeleton />}>
          <SeriesDiscussion series={series} viewer={viewer} />
        </Suspense>
      )}
      <Suspense fallback={<SectionSkeleton className="h-[277px] lg:h-[438px]" />}>
        <Recommendations seriesId={series.id} />
      </Suspense>
    </>
  );
}

function SeriesHeader({ series, viewer }: { series: SeriesDetail; viewer: ViewerState }) {
  const href = `/series/${series.slug}`;
  const first = series.episodes[0];
  const progressEp = viewer.progress && series.episodes.find((e) => e.id === viewer.progress!.episodeId);
  const { stats } = series;

  return (
    <section
      aria-labelledby="series-title"
      className="relative overflow-hidden rounded-[20px] bg-linear-to-br from-surface-2 via-surface to-bg p-5 lg:p-10"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-10">
        <div className="flex gap-4 lg:contents">
          <Cover
            id={series.id}
            title={series.title}
            className="aspect-[3/4] w-[120px] shrink-0 rounded-xl lg:w-[260px] lg:rounded-2xl"
            initialClassName="text-[48px] left-3 bottom-3 lg:text-[120px] lg:left-5 lg:bottom-5"
          />
          {/* Mobile: title block sits next to the cover */}
          <div className="flex min-w-0 flex-col justify-end gap-2 lg:hidden">
            <TitleBlock series={series} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-3.5 lg:justify-center">
          <div className="hidden flex-col items-start gap-3 lg:flex">
            <TitleBlock series={series} />
          </div>

          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm leading-[1.4] text-text-2">
            <li className="flex items-center gap-1">
              <StarIcon size={16} className="text-gold" />
              {stats.ratingAvg != null ? (
                <>
                  <span className="sr-only">คะแนน </span>
                  {stats.ratingAvg.toFixed(1)}
                  <span className="text-muted">({stats.ratingCount.toLocaleString("th-TH")})</span>
                </>
              ) : (
                <span className="text-muted">ยังไม่มีคะแนน</span>
              )}
            </li>
            <li className="flex items-center gap-1">
              <EyeIcon size={16} className="text-muted" />
              {formatViews(stats.views)}
            </li>
            <li className="flex items-center gap-1">
              <HeartIcon size={16} className="text-muted" />
              {stats.follows.toLocaleString("th-TH")} ผู้ติดตาม
            </li>
            <li>{SERIES_STATUS_LABEL[series.status]}</li>
            {series.ageRating !== "all" && (
              <li className="rounded-md bg-hot/15 px-2 py-0.5 text-[13px] font-semibold text-hot">
                {AGE_RATING_LABEL[series.ageRating]}
              </li>
            )}
          </ul>

          {series.synopsis && (
            <p className="max-w-[720px] whitespace-pre-line text-[15px] leading-[1.6] text-text-2 lg:text-base">
              {series.synopsis}
            </p>
          )}

          {viewer.meetsAgeRating ? (
            <div className="flex flex-wrap gap-3 pt-1.5">
              {progressEp ? (
                <Link
                  href={`${href}/${progressEp.number}`}
                  className="flex h-[42px] items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-hover lg:h-12 lg:px-6 lg:text-base"
                >
                  อ่านต่อ ตอนที่ {progressEp.number}
                </Link>
              ) : first ? (
                <Link
                  href={`${href}/${first.number}`}
                  className="flex h-[42px] items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-hover lg:h-12 lg:px-6 lg:text-base"
                >
                  {first.price === 0 ? "อ่านตอนแรกฟรี" : "อ่านตอนแรก"}
                </Link>
              ) : null}
              <SeriesActions
                seriesId={series.id}
                signedIn={viewer.userId != null}
                loginHref={`/login?next=${encodeURIComponent(href)}`}
                initialFollowing={viewer.following}
                initialShelf={viewer.bookshelf}
              />
            </div>
          ) : (
            <AgeGate slug={series.slug} ageRating={series.ageRating} signedIn={viewer.userId != null} />
          )}
        </div>
      </div>
    </section>
  );
}

function TitleBlock({ series }: { series: SeriesDetail }) {
  return (
    <>
      {series.genres.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {series.genres.slice(0, 4).map((g) => (
            <li key={g.slug}>
              <Link
                href={`/genres/${g.slug}`}
                className="block rounded-xl bg-white/12 px-3 py-1 text-[13px] leading-[1.4] text-tag transition-colors hover:bg-white/20"
              >
                {g.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <h1 id="series-title" className="text-[22px] font-bold leading-[1.3] lg:text-[40px] lg:leading-[1.25]">
        {series.title}
      </h1>
      {series.uploader && (
        <p className="flex items-center gap-1.5 text-sm leading-[1.4] text-muted lg:text-[15px]">
          โดย <span className="font-semibold text-text-2">{series.uploader.name}</span>
          {series.uploader.verified && (
            <span
              title="ผู้เขียน/สำนักพิมพ์ที่ยืนยันแล้ว"
              className="grid size-4 place-items-center rounded-full bg-primary text-white"
            >
              <CheckIcon size={11} strokeWidth={3} />
              <span className="sr-only">ยืนยันแล้ว</span>
            </span>
          )}
        </p>
      )}
    </>
  );
}

function Episodes({ series, viewer }: { series: SeriesDetail; viewer: ViewerState }) {
  const row = (e: EpisodeItem) => <EpisodeRow key={e.id} series={series} episode={e} viewer={viewer} />;
  const toRows = (list: EpisodeItem[]) => list.map((e) => ({ key: e.id, node: row(e) }));

  let groups: EpisodeGroup[];
  if (series.seasons.length === 0) {
    groups = [{ key: "all", heading: null, rows: toRows(series.episodes) }];
  } else {
    // Seasons in order, then episodes without a season.
    groups = series.seasons
      .map((s) => ({
        key: `s${s.id}`,
        heading: `Season ${s.number}${s.title ? `: ${s.title}` : ""}`,
        rows: toRows(series.episodes.filter((e) => e.seasonId === s.id)),
      }))
      .filter((g) => g.rows.length > 0);
    const rest = series.episodes.filter((e) => e.seasonId == null);
    if (rest.length > 0) groups.push({ key: "none", heading: "ตอนอื่นๆ", rows: toRows(rest) });
  }

  return <EpisodeList groups={groups} total={series.episodes.length} />;
}

function EpisodeRow({ series, episode, viewer }: { series: SeriesDetail; episode: EpisodeItem; viewer: ViewerState }) {
  const unlockedUntil = viewer.unlocks.get(episode.id);
  const isLast = viewer.progress?.episodeId === episode.id;

  let status;
  if (viewer.isOwner || episode.price === 0) {
    status = episode.price === 0 && <span className="rounded-md bg-free/15 px-2 py-0.5 text-[13px] font-semibold text-free">ฟรี</span>;
  } else if (unlockedUntil) {
    status = (
      <span className="flex items-center gap-1 text-[13px] text-primary">
        <CheckIcon size={14} />
        อ่านได้อีก {daysLeft(unlockedUntil, viewer.now)} วัน
      </span>
    );
  } else {
    status = (
      <span className="flex items-center gap-1 text-[13px] font-semibold text-gold">
        <CoinIcon size={14} />
        {episode.price}
        <span className="sr-only">coin</span>
      </span>
    );
  }

  return (
    <Link
      href={`/series/${series.slug}/${episode.number}`}
      className="flex h-[76px] items-center gap-3.5 rounded-xl bg-surface px-3 transition-colors hover:bg-surface-2"
    >
      <Cover id={series.id} title={series.title} className="h-14 w-[42px] shrink-0 rounded-lg" initialClassName="text-[16px] left-1.5 bottom-1.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.4]">
        <p className="truncate text-[15px] font-semibold">
          ตอนที่ {episode.number}
          {episode.title && <span className="font-normal text-text-2"> · {episode.title}</span>}
        </p>
        <p className="text-[13px] text-muted">
          {formatDate(episode.releasedAt)}
          {isLast && <span className="text-primary"> · อ่านล่าสุด</span>}
        </p>
      </div>
      <div className="shrink-0">{status}</div>
    </Link>
  );
}

async function Recommendations({ seriesId }: { seriesId: number }) {
  const items = await getRecommendations(seriesId);
  if (items.length === 0) return null;
  return (
    <Section title="คนที่อ่านเรื่องนี้ก็อ่าน">
      <Rail desktopClass="lg:grid lg:grid-cols-5 lg:gap-5">
        {items.map((item, i) => (
          <div key={item.id} className={`contents ${i >= 5 ? "lg:hidden" : ""}`}>
            <TrendingCard item={item} />
          </div>
        ))}
      </Rail>
    </Section>
  );
}
