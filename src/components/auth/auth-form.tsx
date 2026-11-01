"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { signIn, signUp, type AuthFormState } from "@/app/actions/auth";

type Mode = "signin" | "signup";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "signin", label: "เข้าสู่ระบบ" },
  { mode: "signup", label: "สมัครสมาชิก" },
];

const INPUT =
  "h-11 w-full rounded-xl bg-surface-2 px-4 text-[15px] text-text placeholder:text-faint outline-none ring-primary/60 focus:ring-2 aria-invalid:ring-2 aria-invalid:ring-hot/70";

export function AuthForm({
  next,
  initialMode,
  initialError,
}: {
  next: string;
  initialMode: Mode;
  initialError?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const id = useId();

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="เลือกการใช้งาน" className="grid grid-cols-2 gap-1.5 rounded-[20px] bg-surface-2 p-1">
        {TABS.map((tab) => {
          const selected = tab.mode === mode;
          return (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.mode}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              onClick={() => setMode(tab.mode)}
              className={`h-9 rounded-2xl text-sm leading-[1.4] transition-colors ${
                selected ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${mode}`}>
        {/* key: remount on tab switch so each form keeps its own action state. */}
        <CredentialsForm
          key={mode}
          mode={mode}
          next={next}
          email={email}
          onEmailChange={setEmail}
          initialError={mode === initialMode ? initialError : undefined}
        />
      </div>
    </div>
  );
}

function CredentialsForm({
  mode,
  next,
  email,
  onEmailChange,
  initialError,
}: {
  mode: Mode;
  next: string;
  email: string;
  onEmailChange: (value: string) => void;
  initialError?: string;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === "signin" ? signIn : signUp,
    { error: initialError },
  );
  const id = useId();
  const signup = mode === "signup";

  if (state.notice) {
    return (
      <div role="status" className="flex flex-col gap-4 text-center">
        <p className="text-[15px] leading-[1.4] text-text-2">{state.notice}</p>
        <p className="text-sm leading-[1.4] text-muted">ไม่เห็นอีเมล? ลองดูในโฟลเดอร์สแปม</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="text-sm font-semibold leading-[1.4] text-text-2">
          อีเมล
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="text-sm font-semibold leading-[1.4] text-text-2">
          รหัสผ่าน
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={signup ? 8 : undefined}
          maxLength={72}
          placeholder={signup ? "อย่างน้อย 8 ตัวอักษร" : undefined}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={INPUT}
        />
      </div>

      {signup && (
        <label className="flex items-start gap-2.5 text-sm leading-[1.4] text-muted">
          <input type="checkbox" name="accept" required className="mt-0.5 size-4 shrink-0 accent-primary" />
          <span>
            ฉันยอมรับ{" "}
            <Link href="/terms" className="text-text-2 underline underline-offset-2 hover:text-text">
              ข้อกำหนดการใช้งาน
            </Link>{" "}
            และ{" "}
            <Link href="/privacy" className="text-text-2 underline underline-offset-2 hover:text-text">
              นโยบายความเป็นส่วนตัว
            </Link>
          </span>
        </label>
      )}

      {state.error && (
        <p id={`${id}-error`} role="alert" className="rounded-xl bg-hot/10 px-4 py-3 text-sm leading-[1.4] text-hot">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-full bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "กำลังดำเนินการ…" : signup ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
      </button>

      {signup && (
        <p className="text-center text-xs leading-[1.4] text-faint">สมัครและยืนยันอีเมลวันนี้ รับฟรี 5 coin</p>
      )}
    </form>
  );
}
