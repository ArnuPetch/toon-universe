import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { Cover } from "@/components/cover";
import {
  AGE_RATING_LABEL,
  EPISODE_STATE_LABEL,
  formatDateTime,
  formatNumber,
  MODERATION_LABEL,
  SERIES_STATUS_LABEL,
  VISIBILITY_LABEL,
} from "@/components/format";
import { ChevronRightIcon, CoinIcon } from "@/components/icons";
import { PageMain, SignInPrompt } from "@/components/page";
import { Section, SectionSkeleton } from "@/components/section";
import {
  CARD,
  Crumbs,
  EPISODE_STATE_TONE,
  MODERATION_TONE,
  Pill,
  StatTile,
  VISIBILITY_TONE,
} from "@/components/studio/bits";
import { CoverUploader } from "@/components/studio/cover-uploader";
import { DeleteSeriesButton, PublishToggle, SeasonManager } from "@/components/studio/series-controls";
import { SeriesForm } from "@/components/studio/series-form";
import { TopBar } from "@/components/top-bar";
import { getUserId } from "@/lib/server/auth";
import { getGenres } from "@/lib/server/browse";
import { getStudioSeries, type StudioEpisode, type StudioSeries } from "@/lib/server/studio";

// Manage one series: status, stats, episodes, seasons, info, delete.

export const metadata: Metadata = {
  title: "จัดการเรื่อง — Toon Universe",
  robots: { index: false },
};

export default function StudioSeriesPage({ params }: PageProps<"/studio/series/[id]">) {
  return (
    <>
      <TopBar />
      <PageMain>
        <Suspense
          fallback={
            <>
              <SectionSkeleton className="h-[180px] rounded-[20px]" />
              <SectionSkeleton className="h-[480px] rounded-[20px]" />
            </>
          }
        >
          <SeriesContent id={params.then((p) => p.id)} />
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}

async function SeriesContent({ id: idPromise }: { id: Promise<string> }) {
  const id = Number(await idPromise);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  if (!(await getUserId())) return <SignInPrompt next={`/studio/series/${id}`} text="เข้าสู่ระบบเพื่อจัดการผลงาน" />;
  const [s, genres] = await Promise.all([getStudioSeries(id), getGenres()]);
  if (!s) notFound();

  const released = s.episodes.filter((e) => e.state === "released").length;
  const isPublic = s.visibility === "published" && s.moderation === "active";

  return (
    <>
      <div className="flex flex-col gap-4">
        <Crumbs items={[{ href: "/studio", label: "สตูดิโอ" }, { label: s.title }]} />
        <section aria-label="ข้อมูลเรื่อง" className={`${CARD} flex flex-col gap-5 lg:flex-row lg:items-center`}>
          <div className="flex min-w-0 flex-1 gap-4 lg:gap-5">
            <Cover id={s.id} coverKey={s.coverKey} title={s.title} className="aspect-[3/4] w-[88px] shrink-0 rounded-xl lg:w-[112px]" />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Pill tone={VISIBILITY_TONE[s.visibility]}>{VISIBILITY_LABEL[s.visibility]}</Pill>
                {s.moderation !== "active" && (
                  <Pill tone={MODERATION_TONE[s.moderation]}>{MODERATION_LABEL[s.moderation]}</Pill>
                )}
                <Pill>{SERIES_STATUS_LABEL[s.status]}</Pill>
                <Pill>{AGE_RATING_LABEL[s.ageRating]}</Pill>
              </div>
              <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">{s.title}</h1>
              {isPublic ? (
                <Link
                  href={`/series/${s.slug}`}
                  className="flex w-fit items-center gap-0.5 text-sm leading-[1.4] text-primary hover:underline"
                >
                  ดูหน้าเรื่องที่ผู้อ่านเห็น
                  <ChevronRightIcon size={16} />
                </Link>
              ) : (
                <p className="text-sm leading-[1.4] text-muted">
                  {s.visibility === "draft" ? "ผู้อ่านยังไม่เห็นเรื่องนี้" : "ผู้อ่านเข้าเรื่องนี้ไม่ได้ในขณะนี้"}
                </p>
              )}
            </div>
          </div>
          {s.moderation !== "removed" && (
            <div className="lg:w-[260px]">
              <PublishToggle seriesId={s.id} published={s.visibility === "published"} releasedEpisodes={released} />
            </div>
          )}
        </section>
      </div>

      {s.hold && (
        <p role="status" className="rounded-xl bg-gold/10 px-4 py-3 text-sm leading-[1.5] text-gold">
          ผู้ดูแลปิดเรื่องนี้ชั่วคราวเพื่อตรวจสอบตั้งแต่ {formatDateTime(s.hold.startedAt)} — {s.hold.reason}
          <br />
          ระหว่างนี้ผู้อ่านเข้าไม่ได้ รายได้จากเรื่องนี้ถอนไม่ได้ เมื่อเปิดอีกครั้งผู้อ่านจะได้เวลาอ่านชดเชย
        </p>
      )}
      {s.moderation === "removed" && (
        <p role="status" className="rounded-xl bg-hot/10 px-4 py-3 text-sm leading-[1.5] text-hot">
          เรื่องนี้ถูกถอดโดยผู้ดูแล ผู้อ่านจะไม่เห็นอีก หากคิดว่าผิดพลาดกรุณาติดต่อทีมงาน
        </p>
      )}

      <section aria-label="สถิติ" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <StatTile label="ยอดวิว" value={formatNumber(s.stats.views)} sub={`30 วัน: ${formatNumber(s.stats.views30d)}`} />
        <StatTile label="ผู้ติดตาม" value={formatNumber(s.stats.followers)} />
        <StatTile label="ยอดซื้อตอน" value={formatNumber(s.stats.unlocks)} sub={`30 วัน: ${formatNumber(s.stats.unlocks30d)}`} />
        <StatTile label="รายได้" value={formatNumber(s.stats.revenue)} sub={`30 วัน: ${formatNumber(s.stats.revenue30d)}`} accent />
      </section>

      <Section
        title={`ตอน (${s.episodes.length})`}
        aside={
          <Link
            href={`/studio/series/${s.id}/episodes/new`}
            className="flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            + เพิ่มตอน
          </Link>
        }
      >
        <EpisodeTable s={s} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <Section title="ข้อมูลเรื่อง">
          <div className={CARD}>
            <SeriesForm
              genres={genres.map((g) => ({ id: g.id, name: g.name }))}
              values={{
                id: s.id,
                title: s.title,
                slug: s.slug,
                synopsis: s.synopsis ?? "",
                ageRating: s.ageRating,
                status: s.status,
                readingMode: s.readingMode,
                readingDirection: s.readingDirection,
                genreIds: s.genreIds,
              }}
            />
          </div>
        </Section>
        <div className="flex flex-col gap-8 lg:gap-10">
          <Section title="ปก">
            <div className={CARD}>
              <CoverUploader seriesId={s.id} title={s.title} coverKey={s.coverKey} />
            </div>
          </Section>
          <Section title="Season">
            <div className={CARD}>
              <SeasonManager
                seriesId={s.id}
                seasons={s.seasons.map((x) => ({
                  ...x,
                  episodes: s.episodes.filter((e) => e.seasonId === x.id).length,
                }))}
              />
            </div>
          </Section>
          <Section title="ลบเรื่อง">
            <div className={`${CARD} flex flex-col gap-3`}>
              <p className="text-sm leading-[1.5] text-muted">
                ลบแล้วกู้คืนไม่ได้ ผู้อ่านที่ซื้อตอนไว้และยังไม่หมดอายุจะได้ coin คืน
              </p>
              <div>
                <DeleteSeriesButton seriesId={s.id} title={s.title} />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function EpisodeTable({ s }: { s: StudioSeries }) {
  if (s.episodes.length === 0) {
    return (
      <p className="rounded-[20px] bg-surface px-4 py-10 text-center text-sm leading-[1.5] text-muted">
        ยังไม่มีตอน — กด “เพิ่มตอน” เพื่ออัพโหลดตอนแรก
      </p>
    );
  }
  const seasonName = new Map(s.seasons.map((x) => [x.id, `S${x.number}`]));
  const rows = [...s.episodes].reverse(); // newest first
  return (
    <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-surface">
      {rows.map((e) => (
        <li key={e.id}>
          <EpisodeRow e={e} seriesId={s.id} season={e.seasonId ? seasonName.get(e.seasonId) : undefined} />
        </li>
      ))}
    </ul>
  );
}

function EpisodeRow({ e, seriesId, season }: { e: StudioEpisode; seriesId: number; season?: string }) {
  return (
    <Link
      href={`/studio/series/${seriesId}/episodes/${e.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-surface-2 lg:gap-5 lg:px-5"
    >
      <span className="w-12 shrink-0 text-[15px] font-bold leading-[1.4] text-text-2 lg:w-14">#{e.number}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-[15px] leading-[1.4]">
          {season && <span className="text-muted">{season} · </span>}
          {e.title || `ตอนที่ ${e.number}`}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-[1.4] text-muted">
          <Pill tone={EPISODE_STATE_TONE[e.state]}>{EPISODE_STATE_LABEL[e.state]}</Pill>
          {e.state === "scheduled" && e.publishAt && <span>{formatDateTime(e.publishAt)}</span>}
          <span className={e.pageCount === 0 ? "text-hot" : ""}>{e.pageCount} หน้า</span>
          <span className="lg:hidden">
            {formatNumber(e.views)} วิว · {formatNumber(e.unlocks)} ซื้อ
          </span>
        </div>
      </div>
      <dl className="hidden w-[180px] grid-cols-2 gap-2 text-xs leading-[1.4] lg:grid">
        <div>
          <dt className="text-faint">วิว</dt>
          <dd className="font-semibold text-text-2">{formatNumber(e.views)}</dd>
        </div>
        <div>
          <dt className="text-faint">ซื้อ</dt>
          <dd className="font-semibold text-text-2">{formatNumber(e.unlocks)}</dd>
        </div>
      </dl>
      <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-sm font-semibold">
        {e.price === 0 ? (
          <span className="text-free">ฟรี</span>
        ) : (
          <>
            <CoinIcon size={14} />
            <span className="text-gold">{e.price}</span>
          </>
        )}
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-muted" />
    </Link>
  );
}
