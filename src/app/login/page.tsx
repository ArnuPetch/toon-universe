import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { SectionSkeleton } from "@/components/home/section";
import { getUserId } from "@/lib/server/auth";
import { safeNext } from "@/lib/safe-next";

// Login / sign-up (email + password). Styled after the Home page.

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ — Toon Universe",
  robots: { index: false },
};

const QUERY_ERRORS: Record<string, string> = {
  confirm_failed: "ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุแล้ว กรุณาเข้าสู่ระบบหรือสมัครใหม่อีกครั้ง",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
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
          <h1 className="mb-1 text-[22px] font-bold leading-[1.4] lg:text-2xl">ยินดีต้อนรับ</h1>
          <p className="mb-6 text-sm leading-[1.4] text-muted">อ่านต่อได้ทุกอุปกรณ์ เก็บเรื่องเข้าชั้น และปลดล็อกตอนด้วย coin</p>
          <Suspense fallback={<SectionSkeleton className="h-[318px]" />}>
            <LoginContent searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(first(params.next));

  // Already signed in → nothing to do here.
  if (await getUserId()) redirect(next);

  const errorKey = first(params.error);
  return (
    <AuthForm
      next={next}
      initialMode={first(params.mode) === "signup" ? "signup" : "signin"}
      initialError={errorKey ? QUERY_ERRORS[errorKey] : undefined}
    />
  );
}
