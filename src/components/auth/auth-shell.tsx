import Link from "next/link";
import type { ReactNode } from "react";

/** Logo header + centered card, shared by /login, /forgot-password, /reset-password. */
export function AuthShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[59px] max-w-[1440px] items-center px-4 lg:h-[75px] lg:px-12">
          <Link href="/" className="text-lg font-bold leading-[1.4] tracking-tight lg:text-[22px]">
            <span className="text-primary">Toon</span> Universe
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 lg:items-center lg:py-12">
        <div className="w-full max-w-[420px] rounded-[20px] bg-surface p-6 lg:p-8">
          <h1 className="mb-1 text-[22px] font-bold leading-[1.4] lg:text-2xl">{title}</h1>
          <p className="mb-6 text-sm leading-[1.4] text-muted">{sub}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
