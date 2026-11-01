import Link from "next/link";
import type { ReactNode } from "react";
import { BottomTabBar } from "./bottom-tab-bar";
import { PageMain } from "./page";
import { TopBar } from "./top-bar";

// Layout for /terms and /privacy: static text, readable line length.

export function LegalPage({
  title,
  updated,
  other,
  children,
}: {
  title: string;
  /** e.g. "1 พฤศจิกายน 2569" */
  updated: string;
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <>
      <TopBar />
      <PageMain narrow>
        <article className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
          <header className="flex flex-col gap-1">
            <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">{title}</h1>
            <p className="text-sm leading-[1.4] text-muted">ปรับปรุงล่าสุด {updated}</p>
          </header>
          {children}
          <p className="border-t border-line pt-6 text-sm leading-[1.6] text-muted">
            ดูเพิ่มเติม:{" "}
            <Link href={other.href} className="text-text-2 underline underline-offset-2 hover:text-text">
              {other.label}
            </Link>
          </p>
        </article>
      </PageMain>
      <BottomTabBar active="" />
    </>
  );
}

export function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`clause-${n}`} className="flex flex-col gap-3">
      <h2 id={`clause-${n}`} className="text-lg font-bold leading-[1.4] lg:text-xl">
        {n}. {title}
      </h2>
      <div className="flex flex-col gap-3 text-[15px] leading-[1.7] text-text-2 [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
