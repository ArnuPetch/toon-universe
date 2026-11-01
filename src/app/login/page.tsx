import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { SectionSkeleton } from "@/components/section";
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
    <AuthShell title="ยินดีต้อนรับ" sub="อ่านต่อได้ทุกอุปกรณ์ เก็บเรื่องเข้าชั้น และปลดล็อกตอนด้วย coin">
      <Suspense fallback={<SectionSkeleton className="h-[318px]" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
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
