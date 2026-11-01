import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PageMain, PageTitle, SignInPrompt } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { CARD, Crumbs } from "@/components/studio/bits";
import { SeriesForm } from "@/components/studio/series-form";
import { TopBar } from "@/components/top-bar";
import { getUserId } from "@/lib/server/auth";
import { getGenres } from "@/lib/server/browse";

export const metadata: Metadata = {
  title: "สร้างเรื่องใหม่ — Toon Universe",
  robots: { index: false },
};

export default function NewSeriesPage() {
  return (
    <>
      <TopBar />
      <PageMain narrow>
        <div className="flex flex-col gap-2">
          <Crumbs items={[{ href: "/studio", label: "สตูดิโอ" }, { label: "สร้างเรื่องใหม่" }]} />
          <PageTitle sub="สร้างเป็นฉบับร่างก่อน เพิ่มตอนแล้วค่อยกดเผยแพร่">สร้างเรื่องใหม่</PageTitle>
        </div>
        <Suspense fallback={<SectionSkeleton className="h-[760px] rounded-[20px]" />}>
          <NewSeries />
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}

async function NewSeries() {
  const [userId, genres] = await Promise.all([getUserId(), getGenres()]);
  if (!userId) return <SignInPrompt next="/studio/series/new" text="เข้าสู่ระบบเพื่อสร้างผลงาน" />;
  return (
    <div className={CARD}>
      <SeriesForm
        genres={genres.map((g) => ({ id: g.id, name: g.name }))}
        values={{
          title: "",
          slug: "",
          synopsis: "",
          ageRating: "all",
          status: "ongoing",
          readingMode: "vertical",
          readingDirection: "ltr",
          genreIds: [],
        }}
      />
    </div>
  );
}
