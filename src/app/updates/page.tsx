import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { filterHref, parseFilters } from "@/components/browse/filters";
import { Pagination } from "@/components/browse/pagination";
import { SeriesGrid, SeriesGridSkeleton } from "@/components/browse/series-grid";
import { EmptyState, PageMain, PageTitle } from "@/components/page";
import { TopBar } from "@/components/top-bar";
import { searchSeries } from "@/lib/server/browse";

// "อัพเดตล่าสุด" (Home → ดูทั้งหมด): series by latest episode, newest first.

export const metadata: Metadata = {
  title: "อัพเดตล่าสุด — Toon Universe",
  description: "มังงะ มังฮวา ที่เพิ่งลงตอนใหม่",
};

export default function UpdatesPage({ searchParams }: PageProps<"/updates">) {
  return (
    <>
      <TopBar />
      <PageMain>
        <PageTitle sub="เรื่องที่เพิ่งลงตอนใหม่ เรียงจากล่าสุด">อัพเดตล่าสุด</PageTitle>
        <Suspense fallback={<SeriesGridSkeleton count={18} />}>
          {searchParams.then((sp) => (
            <Updates page={parseFilters(sp).page} />
          ))}
        </Suspense>
      </PageMain>
      <BottomTabBar active="" />
    </>
  );
}

async function Updates({ page }: { page: number }) {
  const result = await searchSeries({ sort: "updated", page });
  // Series that never released an episode sort last; they aren't "updates".
  const items = result.items.filter((i) => i.latestEpisode);
  if (items.length === 0) {
    return <EmptyState title="ยังไม่มีตอนใหม่" text="กลับมาดูใหม่เร็วๆ นี้นะ" action={{ href: "/", label: "กลับหน้าแรก" }} />;
  }
  const lastPage = items.length < result.items.length ? result.page : result.pageCount;
  return (
    <>
      <SeriesGrid items={items} now={result.now} show="latest" />
      <Pagination
        page={result.page}
        pageCount={lastPage}
        hrefFor={(p) => filterHref("/updates", { page: 1 }, { page: p })}
      />
    </>
  );
}
