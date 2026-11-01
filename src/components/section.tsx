import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

export function Section({
  title,
  icon,
  seeAllHref,
  aside,
  children,
}: {
  title: string;
  icon?: ReactNode;
  seeAllHref?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold leading-[1.4] lg:text-[22px]">
          {icon}
          {title}
        </h2>
        {aside}
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="flex items-center gap-0.5 text-sm leading-[1.4] text-muted transition-colors hover:text-text"
          >
            ดูทั้งหมด
            <ChevronRightIcon size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Horizontal scroll row on mobile; `desktopClass` sets the desktop layout. */
export function Rail({ children, desktopClass }: { children: ReactNode; desktopClass: string }) {
  return (
    <div
      className={`no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:mx-0 lg:overflow-visible lg:px-0 ${desktopClass}`}
    >
      {children}
    </div>
  );
}

export function SectionSkeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-surface ${className}`} />;
}
