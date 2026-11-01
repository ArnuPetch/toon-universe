import { notFound } from "next/navigation";
import { EPISODE_STATE_LABEL, formatDateTime, toBangkokLocalInput } from "../format";
import { SignInPrompt } from "../page";
import { Section } from "../section";
import { getUserId } from "@/lib/server/auth";
import { getStudioEpisode } from "@/lib/server/studio";
import { CARD, Crumbs, EPISODE_STATE_TONE, Pill } from "./bits";
import { DeleteEpisodeButton, EpisodeForm } from "./episode-form";
import { PageUploader } from "./page-uploader";

// Server part of the new / edit episode pages (the routes only parse params).

export async function EpisodeEditor({ seriesId, episodeId }: { seriesId: number; episodeId: number | null }) {
  if (!Number.isSafeInteger(seriesId) || seriesId <= 0) notFound();
  if (episodeId !== null && (!Number.isSafeInteger(episodeId) || episodeId <= 0)) notFound();
  const next = `/studio/series/${seriesId}/episodes/${episodeId ?? "new"}`;
  if (!(await getUserId())) return <SignInPrompt next={next} text="เข้าสู่ระบบเพื่อจัดการผลงาน" />;

  const d = await getStudioEpisode(seriesId, episodeId);
  if (!d) notFound();
  const e = d.episode;
  const heading = e ? `ตอนที่ ${e.number}${e.title ? ` · ${e.title}` : ""}` : "เพิ่มตอนใหม่";
  const minLocal = toBangkokLocalInput(new Date(d.now).toISOString());

  return (
    <>
      <div className="flex flex-col gap-2">
        <Crumbs
          items={[
            { href: "/studio", label: "สตูดิโอ" },
            { href: `/studio/series/${d.series.id}`, label: d.series.title },
            { label: e ? `ตอนที่ ${e.number}` : "เพิ่มตอน" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">{heading}</h1>
          {e && <Pill tone={EPISODE_STATE_TONE[e.state]}>{EPISODE_STATE_LABEL[e.state]}</Pill>}
        </div>
      </div>

      <Section title="รายละเอียดตอน">
        <div className={CARD}>
          <EpisodeForm
            seriesId={d.series.id}
            seasons={d.series.seasons}
            minLocal={minLocal}
            priceLockedUntilLabel={d.priceLockedUntil ? formatDateTime(d.priceLockedUntil) : null}
            values={{
              id: e?.id,
              number: e?.number ?? d.nextNumber,
              title: e?.title ?? "",
              seasonId: e?.seasonId ?? d.series.seasons.at(-1)?.id ?? null,
              price: e?.price ?? 0,
              state: e?.state ?? "draft",
              publishAtLocal: e?.state === "scheduled" && e.publishAt ? toBangkokLocalInput(e.publishAt) : "",
              releasedAtLabel: e?.state === "released" && e.publishAt ? formatDateTime(e.publishAt) : undefined,
              pageCount: e?.pageCount ?? 0,
            }}
          />
        </div>
      </Section>

      {e && (
        <Section title={`หน้าของตอน (${d.pages.length})`}>
          <div className={`${CARD} flex flex-col gap-5`}>
            {d.pages.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm leading-[1.4] text-text-2">หน้าที่บันทึกไว้</p>
                <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
                  {d.pages.map((p) => (
                    <li
                      key={p.id}
                      title={`หน้า ${p.pageNumber} · ${p.width ?? "?"}×${p.height ?? "?"}`}
                      className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md bg-surface-2 text-[11px] text-muted"
                    >
                      {p.url && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL
                        <img src={p.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover object-top" />
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold leading-[1.4] text-white">
                        {p.pageNumber}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <PageUploader seriesId={d.series.id} episodeId={e.id} savedCount={d.pages.length} />
          </div>
        </Section>
      )}

      {e && (
        <Section title="ลบตอน">
          <div className={CARD}>
            <DeleteEpisodeButton seriesId={d.series.id} episodeId={e.id} released={e.state === "released"} />
          </div>
        </Section>
      )}
    </>
  );
}
