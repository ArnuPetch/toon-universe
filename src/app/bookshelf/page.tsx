import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { ShelfMenu, UnfollowButton } from "@/components/bookshelf/shelf-controls";
import { LinkTabs } from "@/components/browse/link-tabs";
import { Cover } from "@/components/cover";
import { SHELF_LABEL, timeAgo } from "@/components/format";
import { EmptyState, PageMain, PageTitle, SignInPrompt } from "@/components/page";
import { SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getLibrary, type FollowItem, type ShelfItem } from "@/lib/server/library";
import type { BookshelfStatus } from "@/lib/server/series";

// Bookshelf: reading / plan to read / completed + followed series. Personal,
// never cached. ?tab=reading|plan_to_read|completed|following

export const metadata: Metadata = {
  title: "ชั้นหนังสือ — Toon Universe",
  robots: { index: false },
};

type Tab = BookshelfStatus | "following";
const TABS: Tab[] = ["reading", "plan_to_read", "completed", "following"];

const EMPTY: Record<Tab, { title: string; text: string }> = {
  reading: { title: "ยังไม่มีเรื่องที่กำลังอ่าน", text: "เริ่มอ่านเรื่องไหนก็ตาม เรื่องนั้นจะมาอยู่ที่นี่ให้อ่านต่อได้ทุกอุปกรณ์" },
  plan_to_read: { title: "ยังไม่มีเรื่องที่อยากอ่าน", text: "กด “ชั้นหนังสือ” ในหน้าเรื่องเพื่อเก็บไว้อ่านทีหลัง" },
  completed: { title: "ยังไม่มีเรื่องที่อ่านจบ", text: "ย้ายเรื่องที่อ่านจบแล้วมาไว้ที่นี่ได้จากปุ่มตั้งค่าของแต่ละเรื่อง" },
  following: { title: "ยังไม่ได้ติดตามเรื่องไหน", text: "กด “ติดตาม” ในหน้าเรื่องเพื่อรับแจ้งเตือนเมื่อมีตอนใหม่" },
};

export default function BookshelfPage({ searchParams }: PageProps<"/bookshelf">) {
  return (
    <>
      <TopBar active="/bookshelf" />
      <PageMain>
        <PageTitle>ชั้นหนังสือ</PageTitle>
        <Suspense
          fallback={
            <div className="flex flex-col gap-6">
              <SectionSkeleton className="h-11 w-full max-w-[520px] rounded-[20px]" />
              <SectionSkeleton className="h-[400px]" />
            </div>
          }
        >
          {searchParams.then((sp) => {
            const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
            return <Shelf tab={TABS.find((t) => t === raw) ?? "reading"} />;
          })}
        </Suspense>
      </PageMain>
      <BottomTabBar active="/bookshelf" />
    </>
  );
}

async function Shelf({ tab }: { tab: Tab }) {
  const library = await getLibrary();
  if (!library) {
    return <SignInPrompt next="/bookshelf" text="เก็บเรื่องที่ชอบเข้าชั้น อ่านต่อจากหน้าที่ค้างไว้ได้ทุกอุปกรณ์" />;
  }

  const count = (t: Tab) => (t === "following" ? library.follows.length : library.shelf.filter((s) => s.status === t).length);
  const label = (t: Tab) => (t === "following" ? "ติดตาม" : SHELF_LABEL[t]);

  return (
    <div className="flex flex-col gap-6">
      <LinkTabs
        label="ชั้นหนังสือ"
        options={TABS.map((t) => ({
          href: t === "reading" ? "/bookshelf" : `/bookshelf?tab=${t}`,
          label: `${label(t)} ${count(t)}`,
          current: t === tab,
        }))}
      />
      {count(tab) === 0 ? (
        <EmptyState {...EMPTY[tab]} action={{ href: "/", label: "หาเรื่องอ่าน" }} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:gap-x-5">
          {tab === "following"
            ? library.follows.map((item) => <FollowRow key={item.id} item={item} now={library.now} />)
            : library.shelf
                .filter((s) => s.status === tab)
                .map((item) => <ShelfRow key={item.id} item={item} now={library.now} />)}
        </ul>
      )}
    </div>
  );
}

function Row({
  href,
  item,
  lines,
  progress,
  tag,
  controls,
}: {
  href: string;
  item: { id: number; title: string; coverKey: string | null };
  lines: string;
  progress?: number;
  tag?: string;
  controls: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 rounded-xl bg-surface pr-3 transition-colors hover:bg-surface-2">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3.5 p-3">
        <Cover id={item.id} coverKey={item.coverKey} title={item.title} className="h-24 w-[72px] shrink-0 rounded-lg" initialClassName="text-[28px] left-2.5 bottom-2.5" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="truncate text-[15px] font-semibold leading-[1.4]">{item.title}</p>
          <p className="truncate text-[13px] leading-[1.4] text-muted">
            {tag && <span className="mr-1.5 rounded-md bg-hot px-1.5 py-0.5 text-[11px] font-bold text-white">{tag}</span>}
            {lines}
          </p>
          {progress != null && (
            <div
              role="progressbar"
              aria-label="ความคืบหน้าของตอนล่าสุด"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 overflow-hidden rounded-full bg-white/10"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </Link>
      {controls}
    </li>
  );
}

function ShelfRow({ item, now }: { item: ShelfItem; now: number }) {
  const p = item.progress;
  const updated = item.lastEpisodeAt ? `อัพเดต ${timeAgo(item.lastEpisodeAt, now)}` : null;
  return (
    <Row
      href={p ? `/series/${item.slug}/${p.episodeNumber}` : `/series/${item.slug}`}
      item={item}
      lines={
        p
          ? [`ตอนที่ ${p.episodeNumber} · หน้า ${p.page}/${p.pageCount}`, updated].filter(Boolean).join(" · ")
          : (updated ?? "ยังไม่ได้เริ่มอ่าน")
      }
      progress={p && p.pageCount > 0 ? Math.min(100, Math.round((p.page / p.pageCount) * 100)) : undefined}
      tag={item.hasNew ? "ตอนใหม่" : undefined}
      controls={<ShelfMenu seriesId={item.id} title={item.title} status={item.status} />}
    />
  );
}

function FollowRow({ item, now }: { item: FollowItem; now: number }) {
  return (
    <Row
      href={`/series/${item.slug}`}
      item={item}
      lines={item.lastEpisodeAt ? `ตอนล่าสุด ${timeAgo(item.lastEpisodeAt, now)}` : "ยังไม่มีตอน"}
      controls={<UnfollowButton seriesId={item.id} title={item.title} />}
    />
  );
}
