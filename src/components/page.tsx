import Link from "next/link";
import type { ReactNode } from "react";

// Building blocks shared by the inner pages (same spacing as the Home page).

/** <main> with the Home page's width, gutters and section gaps. `narrow` for forms/lists. */
export function PageMain({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-8 px-4 pb-24 pt-4 lg:gap-10 lg:px-12 lg:pb-[139px] lg:pt-8 ${
        narrow ? "max-w-[1040px]" : "max-w-[1440px]"
      }`}
    >
      {children}
    </main>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">{children}</h1>
      {sub && <p className="text-sm leading-[1.4] text-muted">{sub}</p>}
    </div>
  );
}

/** Message box for empty lists / signed-out states, with an optional action. */
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] bg-surface px-6 py-12 text-center lg:py-16">
      <p className="text-base font-semibold leading-[1.4] lg:text-lg">{title}</p>
      {text && <p className="max-w-[420px] text-sm leading-[1.5] text-muted">{text}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-3 flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Signed-out state of a personal page. */
export function SignInPrompt({ next, text }: { next: string; text: string }) {
  return (
    <EmptyState
      title="เข้าสู่ระบบก่อนนะ"
      text={text}
      action={{ href: `/login?next=${encodeURIComponent(next)}`, label: "เข้าสู่ระบบ / สมัครสมาชิก" }}
    />
  );
}
