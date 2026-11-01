import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

/** Prev / page numbers / next. `hrefFor(page)` builds each page's URL. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  // 1 … p-1 p p+1 … last
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const btn = "grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm leading-none transition-colors";
  return (
    <nav aria-label="เลือกหน้า" className="flex justify-center">
      <ul className="flex items-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} aria-label="หน้าก่อน" className={`${btn} bg-surface hover:bg-surface-2`}>
              <ChevronLeftIcon size={18} />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${btn} bg-surface text-faint`}>
              <ChevronLeftIcon size={18} />
            </span>
          )}
        </li>
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-1.5">
            {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-faint">…</span>}
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? "page" : undefined}
              className={`${btn} ${p === page ? "bg-primary font-semibold text-white" : "bg-surface hover:bg-surface-2"}`}
            >
              {p}
            </Link>
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} aria-label="หน้าถัดไป" className={`${btn} bg-surface hover:bg-surface-2`}>
              <ChevronRightIcon size={18} />
            </Link>
          ) : (
            <span aria-hidden="true" className={`${btn} bg-surface text-faint`}>
              <ChevronRightIcon size={18} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
