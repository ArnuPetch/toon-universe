import Link from "next/link";

// Link-based choices (tabs, filter chips). Each option is a URL, so filters
// work without JS, can be shared, and are cached per URL.

export type LinkOption = { href: string; label: string; current: boolean };

/** Segmented control like the Home ranking tabs (one choice of a few). */
export function LinkTabs({ label, options, className = "" }: { label: string; options: LinkOption[]; className?: string }) {
  return (
    <nav aria-label={label} className={`no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0 ${className}`}>
      <ul className="flex w-max gap-1.5 rounded-[20px] bg-surface p-1">
        {options.map((o) => (
          <li key={o.href}>
            <Link
              href={o.href}
              scroll={false}
              aria-current={o.current ? "page" : undefined}
              className={`flex h-9 items-center whitespace-nowrap rounded-2xl px-4 text-sm leading-[1.4] transition-colors ${
                o.current ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"
              }`}
            >
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A labelled row of filter chips; scrolls sideways on mobile. */
export function ChipRow({ label, options }: { label: string; options: LinkOption[] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[13px] leading-[1.4] text-muted lg:w-14 lg:text-sm">{label}</span>
      <nav aria-label={label} className="no-scrollbar -mr-4 min-w-0 flex-1 overflow-x-auto pr-4 lg:mr-0 lg:pr-0">
        <ul className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
          {options.map((o) => (
            <li key={o.href}>
              <Link
                href={o.href}
                scroll={false}
                aria-current={o.current ? "page" : undefined}
                className={`block whitespace-nowrap rounded-xl px-3 py-1 text-[13px] leading-[1.4] transition-colors lg:text-sm ${
                  o.current ? "bg-primary font-semibold text-white" : "bg-white/12 text-tag hover:bg-white/20"
                }`}
              >
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
