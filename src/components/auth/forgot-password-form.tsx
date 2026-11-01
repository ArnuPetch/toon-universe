"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { requestPasswordReset, type AuthFormState } from "@/app/actions/auth";
import { ERROR_BOX, INPUT, LABEL } from "../form-styles";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});
  const id = useId();

  if (state.notice) {
    return (
      <div role="status" className="flex flex-col gap-4 text-center">
        <p className="text-[15px] leading-[1.4] text-text-2">{state.notice}</p>
        <p className="text-sm leading-[1.4] text-muted">ไม่เห็นอีเมล? ลองดูในโฟลเดอร์สแปม</p>
        <Link href="/login" className="text-sm text-text-2 underline underline-offset-2 hover:text-text">
          กลับไปเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className={LABEL}>
          อีเมล
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={INPUT}
        />
      </div>
      {state.error && (
        <p id={`${id}-error`} role="alert" className={ERROR_BOX}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-full bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
      </button>
      <Link href="/login" className="text-center text-sm text-muted transition-colors hover:text-text">
        กลับไปเข้าสู่ระบบ
      </Link>
    </form>
  );
}
