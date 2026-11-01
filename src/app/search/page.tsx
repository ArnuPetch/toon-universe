import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { BrowseFilters, filterHref, parseFilters, type FilterState } from "@/components/browse/filters";
import { Pagination } from "@/components/browse/pagination";
import { SeriesGrid, SeriesGridSkeleton } from "@/components/browse/series-grid";
import { SearchIcon } from "@/components/icons";
import { EmptyState, PageMain } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getGenre, getGenres, searchSeries } from "@/lib/server/browse";

// Search & filter: free text (title / author / genre) + genre, status, price,
// sort. All filters live in the URL (?q=&genre=&status=&price=&sort=&page=).

export const metadata: Metadata = {
  title: "ค้นหา — Toon Universe",
  robots: { index: false },
};

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  const state = searchParams.then(parseFilters);
  return (
    <>
      <TopBar search={false} />
      <PageMain>
        <Suspense fallback={<SectionSkeleton className="h-12 rounded-full lg:h-14" />}>
          {state.then((s) => (
            <SearchForm state={s} />
          ))}
        </Suspense>
        <Suspense fallback={<ResultsSkeleton />}>
          {state.then((s) => (
            <Results state={s} />
          ))}
        </Suspense>
      </PageMain>
      <BottomTabBar active="" />
    </>
  );
}

function SearchForm({ state }: { state: FilterState }) {
  return (
    <form action="/search" role="search" className="relative">
      {/* Keep the other filters when searching again. */}
      {state.genre && <input type="hidden" name="genre" value={state.genre} />}
      {state.status && <input type="hidden" name="status" value={state.status} />}
      {state.price && <input type="hidden" name="price" value={state.price} />}
      <SearchIcon size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-faint" />
      <input
        type="search"
        name="q"
        defaultValue={state.q}
        maxLength={100}
        placeholder="ค้นหาเรื่อง ผู้เขียน หรือแนว"
        aria-label="ค้นหา"
        autoFocus={!state.q}
        className="h-12 w-full rounded-full bg-surface pl-[52px] pr-28 text-[15px] text-text outline-none ring-primary/60 placeholder:text-faint focus:ring-2 lg:h-14 lg:text-base"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover lg:h-11 lg:px-6"
      >
        ค้นหา
      </button>
    </form>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SectionSkeleton className="h-[148px]" />
      <SeriesGridSkeleton />
    </div>
  );
}

async function Results({ state }: { state: FilterState }) {
  const [genres, genre] = await Promise.all([getGenres(), state.genre ? getGenre(state.genre) : null]);
  const result = await searchSeries({
    q: state.q,
    genreId: genre?.id,
    status: state.status,
    price: state.price,
    sort: state.sort,
    page: state.page,
  });
  const filtered = Boolean(state.genre || state.status || state.price);

  return (
    <div className="flex flex-col gap-6">
      <BrowseFilters base="/search" state={state} genres={genres} defaultSort={state.q ? "relevance" : "popular"} />
      <h1 className="text-lg font-bold leading-[1.4] lg:text-[22px]" aria-live="polite">
        {state.q ? `ผลการค้นหา “${state.q}”` : "เรื่องทั้งหมด"}
        <span className="ml-2 text-sm font-normal text-muted">{result.total.toLocaleString("th-TH")} เรื่อง</span>
      </h1>
      {result.items.length === 0 ? (
        <EmptyState
          title="ไม่พบเรื่องที่ตรงกับการค้นหา"
          text={filtered ? "ลองลดตัวกรองหรือใช้คำค้นอื่น" : "ลองใช้คำค้นที่สั้นลง หรือค้นจากชื่อผู้เขียน / แนว"}
          action={filtered ? { href: filterHref("/search", { q: state.q, page: 1 }), label: "ล้างตัวกรอง" } : undefined}
        />
      ) : (
        <>
          <SeriesGrid items={result.items} now={result.now} />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            hrefFor={(page) => filterHref("/search", state, { page })}
          />
        </>
      )}
    </div>
  );
}
