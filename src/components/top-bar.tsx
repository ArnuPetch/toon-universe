import Link from "next/link";
import { Suspense } from "react";
import { getViewerSummary } from "@/lib/server/home";
import { BellIcon, CoinIcon, SearchIcon, UserIcon } from "./icons";

const NAV = [
  { href: "/", label: "หน้าแรก" },
  { href: "/ranking", label: "Ranking" },
  { href: "/genres", label: "หมวดหมู่" },
  { href: "/bookshelf", label: "ชั้นหนังสือ" },
];

function Logo() {
  return (
    <Link href="/" className="shrink-0 text-lg font-bold leading-[1.4] tracking-tight lg:text-[22px]">
      <span className="text-primary">Toon</span> Universe
    </Link>
  );
}

function SearchBox({ className = "" }: { className?: string }) {
  return (
    <form action="/search" role="search" className={`relative ${className}`}>
      <SearchIcon size={18} className="pointer-events-none absolute left-[17px] top-1/2 -translate-y-1/2 text-faint" />
      <input
        type="search"
        name="q"
        placeholder="ค้นหาเรื่อง ผู้เขียน หรือแนว"
        aria-label="ค้นหา"
        className="h-10 w-full rounded-full bg-surface pl-[45px] pr-4 text-sm text-text placeholder:text-faint outline-none ring-primary/60 focus:ring-2 lg:h-[42px]"
      />
    </form>
  );
}

/**
 * `active` = href of the current main section (highlighted in the desktop nav).
 * `search={false}` hides the search box (the search page has its own).
 */
export function TopBar({ active, search = true }: { active?: string; search?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-[59px] max-w-[1440px] items-center gap-2.5 px-4 lg:h-[75px] lg:gap-8 lg:px-12">
        <Logo />
        <nav aria-label="เมนูหลัก" className="hidden gap-6 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === active ? "page" : undefined}
              className={`text-[15px] leading-[1.4] transition-colors hover:text-text ${
                item.href === active ? "font-semibold text-text" : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {search ? <SearchBox className="hidden flex-1 lg:block" /> : <div className="hidden flex-1 lg:block" />}
        <div className="ml-auto flex items-center gap-2.5 lg:ml-0 lg:gap-8">
          <Suspense fallback={<div className="h-[34px] w-[140px] lg:h-10 lg:w-[255px]" />}>
            <ViewerActions />
          </Suspense>
        </div>
      </div>
      {search && (
        <div className="px-4 pb-0 pt-3 lg:hidden">
          <SearchBox />
        </div>
      )}
    </header>
  );
}

async function ViewerActions() {
  const viewer = await getViewerSummary();
  if (!viewer) {
    return (
      <Link
        href="/login"
        className="flex h-[34px] items-center rounded-full bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover lg:h-10 lg:px-5 lg:text-[15px]"
      >
        เข้าสู่ระบบ
      </Link>
    );
  }
  const unread = viewer.unreadNotifications;
  return (
    <>
      <div className="flex h-[34px] items-center gap-1.5 rounded-full bg-surface pl-[11px] pr-[5px] lg:h-10 lg:gap-2 lg:pl-[13px] lg:pr-[6px]">
        <CoinIcon className="size-[18px] lg:size-5" />
        <span className="text-sm font-semibold leading-[1.4] lg:text-[15px]">
          {viewer.coins.toLocaleString("th-TH")}
          <span className="sr-only"> coin</span>
        </span>
        <Link
          href="/coins"
          aria-label="เติม coin"
          className="ml-0.5 grid size-6 place-items-center rounded-full bg-primary transition-colors hover:bg-primary-hover lg:size-7"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus.svg" alt="" width={18} height={18} className="size-3.5 lg:size-4" />
        </Link>
      </div>
      <Link
        href="/notifications"
        aria-label={unread > 0 ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : "การแจ้งเตือน"}
        className="relative grid size-[34px] place-items-center rounded-full bg-surface text-text-2 transition-colors hover:text-text lg:size-10"
      >
        <BellIcon className="size-[18px] lg:size-5" />
        {unread > 0 && (
          <span className="absolute right-[3px] top-[3px] grid h-3.5 min-w-3.5 place-items-center rounded-full bg-hot px-1 text-[9px] font-bold leading-none text-white lg:right-[6px] lg:top-[6px] lg:h-4 lg:min-w-4 lg:text-[10px]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link
        href="/profile"
        aria-label="โปรไฟล์"
        className="hidden size-10 place-items-center rounded-full bg-linear-to-br from-primary to-[#c04cfd] text-white lg:grid"
      >
        <UserIcon size={20} />
      </Link>
    </>
  );
}
