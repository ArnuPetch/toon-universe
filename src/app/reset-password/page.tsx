import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordForm } from "@/components/profile/profile-forms";
import { SectionSkeleton } from "@/components/section";
import { getUserId } from "@/lib/server/auth";

// Step 2 of "forgot password": the recovery link (/auth/confirm) signed the
// user in; now they set a new password. No session → the link expired.

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่ — Toon Universe",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่" sub="ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ อย่างน้อย 8 ตัวอักษร">
      <Suspense fallback={<SectionSkeleton className="h-[200px]" />}>
        <ResetContent />
      </Suspense>
    </AuthShell>
  );
}

async function ResetContent() {
  if (!(await getUserId())) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-[15px] leading-[1.4] text-text-2">ลิงก์หมดอายุหรือถูกใช้ไปแล้ว</p>
        <Link
          href="/forgot-password"
          className="flex h-11 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          ขอลิงก์ใหม่
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PasswordForm submitLabel="ตั้งรหัสผ่านใหม่" />
      <Link href="/" className="text-center text-sm text-muted transition-colors hover:text-text">
        ไปหน้าแรก
      </Link>
    </div>
  );
}
