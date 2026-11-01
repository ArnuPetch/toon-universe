import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

// Step 1 of "forgot password": email a recovery link
// (→ /auth/confirm → /reset-password).

export const metadata: Metadata = {
  title: "ลืมรหัสผ่าน — Toon Universe",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="ลืมรหัสผ่าน" sub="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
