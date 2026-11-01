import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PageMain } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { EpisodeEditor } from "@/components/studio/episode-editor";
import { TopBar } from "@/components/top-bar";

export const metadata: Metadata = {
  title: "เพิ่มตอน — Toon Universe",
  robots: { index: false },
};

export default function NewEpisodePage({ params }: PageProps<"/studio/series/[id]/episodes/new">) {
  return (
    <>
      <TopBar />
      <PageMain narrow>
        <Suspense fallback={<SectionSkeleton className="h-[560px] rounded-[20px]" />}>
          {params.then((p) => (
            <EpisodeEditor seriesId={Number(p.id)} episodeId={null} />
          ))}
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}
