import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import {
  ContinueCard,
  RankItem,
  TrendingCard,
  UpdatedCard,
} from "@/components/home/cards";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { RankingSection } from "@/components/home/ranking-section";
import { Rail, Section, SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { FireIcon } from "@/components/icons";
import {
  getContinueReading,
  getHeroSeries,
  getRecentlyUpdated,
  getTrending,
  getViewRankings,
  type RankingEntry,
} from "@/lib/server/home";

// Home page — Figma "Toon Universe — หน้าหลัก" (Desktop 3:2, Mobile 3:333).
// Every section reads as the current viewer (RLS + age rating), so each one
// streams in behind its own Suspense boundary.

export default function HomePage() {
  return (
    <>
      <TopBar active="/" />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 pb-24 pt-4 lg:gap-12 lg:px-12 lg:pb-[139px] lg:pt-8">
        <Suspense
          fallback={
            <SectionSkeleton className="h-[360px] rounded-[20px] lg:h-[420px]" />
          }
        >
          <Hero />
        </Suspense>
        <Suspense fallback={null}>
          <ContinueReadingSection />
        </Suspense>
        <Suspense
          fallback={<SectionSkeleton className="h-[502px] lg:h-[524px]" />}
        >
          <Ranking />
        </Suspense>
        <Suspense
          fallback={<SectionSkeleton className="h-[627px] lg:h-[286px]" />}
        >
          <RecentlyUpdated />
        </Suspense>
        <Suspense
          fallback={<SectionSkeleton className="h-[277px] lg:h-[438px]" />}
        >
          <Trending />
        </Suspense>
      </main>
      <BottomTabBar active="/" />
    </>
  );
}

async function Hero() {
  const items = await getHeroSeries();
  if (items.length === 0) return null;
  return <HeroCarousel items={items} />;
}

async function ContinueReadingSection() {
  const items = await getContinueReading();
  if (items.length === 0) return null;
  return (
    <Section title="อ่านต่อ" seeAllHref="/bookshelf">
      <Rail desktopClass="lg:grid lg:grid-cols-4 lg:gap-5">
        {items.slice(0, 4).map((item) => (
          <ContinueCard key={item.id} item={item} />
        ))}
      </Rail>
    </Section>
  );
}

function RankingList({ items }: { items: RankingEntry[] }) {
  if (items.length === 0) return null;
  return (
    // Desktop: two columns, 1–5 on the left and 6–10 on the right.
    <ol className="grid gap-3 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-5 lg:gap-x-5">
      {items.map((item, i) => (
        <RankItem
          key={item.id}
          item={item}
          className={i >= 5 ? "max-lg:hidden" : undefined}
        />
      ))}
    </ol>
  );
}

async function Ranking() {
  const lists = await getViewRankings();
  return (
    <RankingSection
      lists={{
        day: <RankingList items={lists.day} />,
        week: <RankingList items={lists.week} />,
        month: <RankingList items={lists.month} />,
      }}
    />
  );
}

async function RecentlyUpdated() {
  const { items, now } = await getRecentlyUpdated();
  if (items.length === 0) return null;
  return (
    <Section title="อัพเดตล่าสุด" seeAllHref="/updates">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-8 lg:gap-5">
        {items.map((item, i) => (
          <div key={item.id} className={i >= 4 ? "max-sm:hidden" : undefined}>
            <UpdatedCard item={item} now={now} />
          </div>
        ))}
      </div>
    </Section>
  );
}

async function Trending() {
  const items = await getTrending();
  if (items.length === 0) return null;
  return (
    <Section
      title="กำลังมาแรง"
      icon={<FireIcon className="size-5 lg:size-[22px]" />}
      seeAllHref="/ranking?kind=trending"
    >
      <Rail desktopClass="lg:grid lg:grid-cols-5 lg:gap-5">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`contents ${i >= 5 ? "lg:hidden" : ""}`}
          >
            <TrendingCard item={item} />
          </div>
        ))}
      </Rail>
    </Section>
  );
}
