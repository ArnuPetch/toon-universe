import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PageMain } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { EpisodeEditor } from "@/components/studio/episode-editor";
import { TopBar } from "@/components/top-bar";

export const metadata: Metadata = {
  title: "แก้ไขตอน — Toon Universe",
  robots: { index: false },
};

export default function EditEpisodePage({ params }: PageProps<"/studio/series/[id]/episodes/[episodeId]">) {
  return (
    <>
      <TopBar />
      <PageMain narrow>
        <Suspense fallback={<SectionSkeleton className="h-[760px] rounded-[20px]" />}>
          {params.then((p) => (
            <EpisodeEditor seriesId={Number(p.id)} episodeId={Number(p.episodeId)} />
          ))}
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}
