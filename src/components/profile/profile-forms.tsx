"use client";

import { useActionState, useId } from "react";
import { updatePassword, type AuthFormState } from "@/app/actions/auth";
import { setBirthDate, updateProfile, type FormState } from "@/app/actions/profile";
import { ERROR_BOX, INPUT, LABEL, PRIMARY_BUTTON, SUCCESS_BOX } from "../form-styles";

function Status({ id, state }: { id: string; state: FormState }) {
  if (state.error) {
    return (
      <p id={id} role="alert" className={ERROR_BOX}>
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className={SUCCESS_BOX}>
        {state.success}
      </p>
    );
  }
  return null;
}

export function ProfileForm({
  displayName,
  username,
  bio,
}: {
  displayName: string | null;
  username: string | null;
  bio: string | null;
}) {
  const [state, action, pending] = useActionState(updateProfile, {});
  const id = useId();
  const invalid = state.error ? true : undefined;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={LABEL}>
            ชื่อที่แสดง
          </label>
          <input
            id={`${id}-name`}
            name="display_name"
            defaultValue={displayName ?? ""}
            maxLength={50}
            placeholder="ชื่อที่คนอื่นเห็น"
            aria-invalid={invalid}
            aria-describedby={state.error ? `${id}-error` : undefined}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-username`} className={LABEL}>
            ชื่อผู้ใช้
          </label>
          <input
            id={`${id}-username`}
            name="username"
            defaultValue={username ?? ""}
            maxLength={30}
            pattern="[a-z0-9_]{3,30}"
            autoCapitalize="none"
            autoComplete="username"
            placeholder="a-z, 0-9, _ (3–30 ตัว)"
            aria-invalid={invalid}
            aria-describedby={state.error ? `${id}-error` : undefined}
            className={INPUT}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-bio`} className={LABEL}>
          แนะนำตัว
        </label>
        <textarea
          id={`${id}-bio`}
          name="bio"
          defaultValue={bio ?? ""}
          maxLength={500}
          rows={3}
          placeholder="เล่าเกี่ยวกับตัวคุณสั้นๆ"
          className={`${INPUT} h-auto resize-y py-3 leading-[1.5]`}
        />
      </div>
      <Status id={`${id}-error`} state={state} />
      <div>
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}

/** Birth date can be set once (age-rated series); `today` = YYYY-MM-DD for the max. */
export function BirthDateForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(setBirthDate, {});
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-date`} className={LABEL}>
          วันเกิด
        </label>
        <div className="flex flex-wrap gap-3">
          <input
            id={`${id}-date`}
            name="birth_date"
            type="date"
            required
            min="1900-01-02"
            max={today}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={`${id}-hint${state.error ? ` ${id}-error` : ""}`}
            className={`${INPUT} w-auto min-w-[200px]`}
          />
          <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
            {pending ? "กำลังบันทึก…" : "บันทึกวันเกิด"}
          </button>
        </div>
        <p id={`${id}-hint`} className="text-xs leading-[1.5] text-muted">
          ใช้ตรวจสิทธิ์อ่านเรื่องเรต 13+ / 18+ เท่านั้น ไม่แสดงให้คนอื่นเห็น · บันทึกแล้วแก้ไขเองไม่ได้ กรุณาตรวจให้ถูกต้อง
        </p>
      </div>
      <Status id={`${id}-error`} state={state} />
    </form>
  );
}

/** New password + confirm. Used on /profile and /reset-password. */
export function PasswordForm({ submitLabel = "เปลี่ยนรหัสผ่าน" }: { submitLabel?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});
  const id = useId();
  const invalid = state.error ? true : undefined;
  const describedBy = state.error ? `${id}-error` : undefined;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pw`} className={LABEL}>
            รหัสผ่านใหม่
          </label>
          <input
            id={`${id}-pw`}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pw2`} className={LABEL}>
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            id={`${id}-pw2`}
            name="password_confirm"
            type="password"
            autoComplete="new-password"
            required
            maxLength={72}
            placeholder="กรอกอีกครั้ง"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={INPUT}
          />
        </div>
      </div>
      <Status id={`${id}-error`} state={{ error: state.error, success: state.notice }} />
      <div>
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "กำลังบันทึก…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
