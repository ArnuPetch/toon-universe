"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { reportContent } from "@/app/actions/social";
import type { Author } from "@/lib/server/social";
import { ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA, TEXT_BUTTON } from "../form-styles";
import { CheckIcon, CloseIcon, EyeOffIcon, StarIcon } from "../icons";

// Small client pieces shared by the review and comment panels.

/** Read-only star row (rounded to the nearest whole star). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} จาก 5 ดาว`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} size={size} className={n <= full ? "text-gold" : "text-surface-2"} />
      ))}
    </span>
  );
}

const STAR_LABEL = ["", "แย่", "พอใช้", "ดี", "ดีมาก", "ยอดเยี่ยม"];

/** 1–5 star picker (radio group, arrow keys work like native radios). */
export function StarInput({
  value,
  onChange,
  disabled,
  size = 32,
  name,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: number;
  name: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="flex items-center gap-3" disabled={disabled}>
      <legend className="sr-only">ให้คะแนน</legend>
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <StarIcon
              size={size}
              className={`rounded-sm transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${
                n <= shown ? "text-gold" : "text-surface-2"
              }`}
            />
            <span className="sr-only">
              {n} ดาว ({STAR_LABEL[n]})
            </span>
          </label>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-semibold text-text-2">{STAR_LABEL[shown]}</span>}
    </fieldset>
  );
}

export function AuthorLine({
  author,
  isUploader,
  isOwn,
  meta,
}: {
  author: Author;
  isUploader: boolean;
  isOwn: boolean;
  meta: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-[1.4]">
      <span className="font-semibold text-text">{author.name}</span>
      {author.verified && (
        <span title="ยืนยันแล้ว" className="grid size-3.5 place-items-center rounded-full bg-primary text-white">
          <CheckIcon size={9} strokeWidth={3} />
          <span className="sr-only">ยืนยันแล้ว</span>
        </span>
      )}
      {isUploader && <span className="rounded-md bg-primary/15 px-1.5 text-[12px] font-semibold text-primary">ผู้เขียน</span>}
      {isOwn && <span className="rounded-md bg-white/12 px-1.5 text-[12px] text-text-2">คุณ</span>}
      <span className="text-faint">· {meta}</span>
    </p>
  );
}

/** Body text; spoilers stay covered until the reader asks to see them. */
export function SpoilerText({ text, spoiler }: { text: string; spoiler: boolean }) {
  const [shown, setShown] = useState(false);
  if (spoiler && !shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="flex w-full items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-left text-sm text-muted transition-colors hover:text-text"
      >
        <EyeOffIcon size={18} />
        มีสปอยล์ — แตะเพื่อดู
      </button>
    );
  }
  return (
    <p className="whitespace-pre-line break-words text-[15px] leading-[1.6] text-text-2">
      {spoiler && <span className="mr-1.5 rounded-md bg-hot/15 px-1.5 text-[12px] font-semibold text-hot">สปอยล์</span>}
      {text}
    </p>
  );
}

export function SpoilerCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      มีสปอยล์ (ซ่อนข้อความไว้ก่อน)
    </label>
  );
}

/** Text area + spoiler toggle + submit, used for new comments, replies and edits. */
export function Composer({
  initialBody = "",
  initialSpoiler = false,
  max,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
  label,
}: {
  initialBody?: string;
  initialSpoiler?: boolean;
  max: number;
  placeholder: string;
  submitLabel: string;
  /** Resolve to an error message, or null on success (the composer then clears). */
  onSubmit: (body: string, spoiler: boolean) => Promise<string | null>;
  onCancel?: () => void;
  autoFocus?: boolean;
  label: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [spoiler, setSpoiler] = useState(initialSpoiler);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trimmed = body.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed.length > max) return;
    setError(null);
    startTransition(async () => {
      const err = await onSubmit(trimmed, spoiler);
      if (err) setError(err);
      else {
        setBody("");
        setSpoiler(false);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <textarea
        aria-label={label}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        maxLength={max}
        disabled={pending}
        autoFocus={autoFocus}
        className={TEXTAREA}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SpoilerCheckbox checked={spoiler} onChange={setSpoiler} disabled={pending} />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-faint" aria-hidden="true">
            {body.length}/{max}
          </span>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={pending} className={SECONDARY_BUTTON}>
              ยกเลิก
            </button>
          )}
          <button type="submit" disabled={pending || !trimmed} className={`${PRIMARY_BUTTON} h-10 px-5 text-sm`}>
            {pending ? "กำลังส่ง…" : submitLabel}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </form>
  );
}

export function SignInToWrite({ href, text }: { href: string; text: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5">
      <p className="text-sm leading-[1.4] text-muted">{text}</p>
      <Link
        href={href}
        className="flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        เข้าสู่ระบบ
      </Link>
    </div>
  );
}

const REASONS = [
  { value: "spam", label: "สแปม / โฆษณา" },
  { value: "abusive", label: "คำหยาบ / คุกคาม" },
  { value: "unhidden_spoiler", label: "สปอยล์โดยไม่ซ่อน" },
] as const;

/** "รายงาน" button + modal dialog. */
export function ReportButton({ kind, id }: { kind: "comment" | "review"; id: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "done" | { error: string }>("idle");
  const [pending, startTransition] = useTransition();

  const open = () => {
    setState("idle");
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await reportContent({ kind, id, reason, details });
      if (r.ok || r.code === "already_reported") setState("done");
      else setState({ error: r.message });
    });
  };

  return (
    <>
      <button type="button" onClick={open} className={TEXT_BUTTON}>
        รายงาน
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`report-${kind}-${id}`}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[20px] bg-surface p-0 text-text backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`report-${kind}-${id}`} className="text-lg font-bold leading-[1.4]">
              รายงาน{kind === "comment" ? "ความคิดเห็น" : "รีวิว"}
            </h3>
            <button
              type="button"
              onClick={close}
              aria-label="ปิด"
              className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
            >
              <CloseIcon size={18} />
            </button>
          </div>
          {state === "done" ? (
            <>
              <p className="text-sm leading-[1.5] text-text-2">ขอบคุณที่แจ้ง ทีมงานจะตรวจสอบโดยเร็ว</p>
              <button type="button" onClick={close} className={PRIMARY_BUTTON}>
                ปิด
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2" disabled={pending}>
                <legend className="mb-1 text-sm font-semibold text-text-2">เหตุผล</legend>
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2 px-4 py-3 text-[15px]"
                  >
                    <input
                      type="radio"
                      name={`reason-${kind}-${id}`}
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="size-4 accent-primary"
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>
              <textarea
                aria-label="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={2000}
                disabled={pending}
                className={TEXTAREA}
              />
              {typeof state === "object" && (
                <p role="alert" className={ERROR_BOX}>
                  {state.error}
                </p>
              )}
              <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
                {pending ? "กำลังส่ง…" : "ส่งรายงาน"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
