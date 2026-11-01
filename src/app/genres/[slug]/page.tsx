import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { BrowseFilters, filterHref, parseFilters, type FilterState } from "@/components/browse/filters";
import { Pagination } from "@/components/browse/pagination";
import { SeriesGrid, SeriesGridSkeleton } from "@/components/browse/series-grid";
import { ChevronLeftIcon } from "@/components/icons";
import { EmptyState, PageMain } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getGenre, searchSeries, type Genre } from "@/lib/server/browse";

// One genre: every public series in it, with status / price / sort filters.

export async function generateMetadata({ params }: PageProps<"/genres/[slug]">): Promise<Metadata> {
  const genre = await getGenre((await params).slug);
  if (!genre) return { title: "ไม่พบหมวดหมู่ — Toon Universe" };
  return { title: `${genre.name} — Toon Universe`, description: `มังงะ มังฮวา แนว${genre.name} อ่านออนไลน์` };
}

export default function GenrePage({ params, searchParams }: PageProps<"/genres/[slug]">) {
  const input = Promise.all([params, searchParams]).then(([p, sp]) => ({ slug: p.slug, state: parseFilters(sp) }));
  return (
    <>
      <TopBar active="/genres" />
      <PageMain>
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <SectionSkeleton className="h-10 w-48" />
              <SectionSkeleton className="h-[112px]" />
              <SeriesGridSkeleton />
            </div>
          }
        >
          {input.then(({ slug, state }) => (
            <GenreContent slug={slug} state={state} />
          ))}
        </Suspense>
      </PageMain>
      <BottomTabBar active="/genres" />
    </>
  );
}

async function GenreContent({ slug, state }: { slug: string; state: FilterState }) {
  const genre = await getGenre(slug);
  if (!genre) notFound();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link
          href="/genres"
          aria-label="กลับไปหมวดหมู่"
          className="grid size-9 place-items-center rounded-full bg-surface text-text-2 transition-colors hover:text-text"
        >
          <ChevronLeftIcon size={20} />
        </Link>
        <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">{genre.name}</h1>
      </div>
      <BrowseFilters base={`/genres/${genre.slug}`} state={{ ...state, q: undefined, genre: undefined }} defaultSort="popular" />
      <Results genre={genre} state={state} />
    </div>
  );
}

async function Results({ genre, state }: { genre: Genre; state: FilterState }) {
  const base = `/genres/${genre.slug}`;
  const clean = { ...state, q: undefined, genre: undefined };
  const result = await searchSeries({ ...clean, genreId: genre.id });
  if (result.items.length === 0) {
    const filtered = Boolean(state.status || state.price);
    return (
      <EmptyState
        title={filtered ? "ไม่มีเรื่องที่ตรงกับตัวกรอง" : `ยังไม่มีเรื่องแนว${genre.name}`}
        text={filtered ? "ลองลดตัวกรองดูนะ" : "ลองดูหมวดหมู่อื่นก่อนนะ"}
        action={filtered ? { href: base, label: "ล้างตัวกรอง" } : { href: "/genres", label: "ดูหมวดหมู่อื่น" }}
      />
    );
  }
  return (
    <>
      <p className="-mt-2 text-sm leading-[1.4] text-muted">{result.total.toLocaleString("th-TH")} เรื่อง</p>
      <SeriesGrid items={result.items} now={result.now} />
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(page) => filterHref(base, clean, { page })} />
    </>
  );
}
