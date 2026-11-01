"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import {
  approveWithdrawal,
  banAccount,
  dismissReports,
  holdSeries,
  liftAccountSanction,
  markPaid,
  rejectWithdrawal,
  releaseSeries,
  resolveReports,
  setHidden,
  setVerified,
  suspendAccount,
  takeDownSeries,
} from "@/app/actions/admin";
import { ERROR_BOX, INPUT, SECONDARY_BUTTON, TEXTAREA } from "../form-styles";

// One button per admin action. Actions that need a reason / extra input or are
// destructive open a <dialog> first. Server components pass plain ids; the
// action (and its admin check) runs on the server.

export type AdminActionSpec =
  | { kind: "dismiss"; reportIds: number[] }
  | { kind: "resolve"; reportIds: number[] }
  | { kind: "hide"; targetType: "comment" | "review"; targetId: number; hidden: boolean }
  | { kind: "hold"; seriesId: number; reportIds?: number[] }
  | { kind: "release"; seriesId: number }
  | { kind: "takedown"; seriesId: number; reportIds?: number[] }
  | { kind: "suspend"; userId: string; reportIds?: number[] }
  | { kind: "ban"; userId: string; reportIds?: number[] }
  | { kind: "lift"; sanctionId: number }
  | { kind: "verify"; userId: string; verified: boolean }
  | { kind: "approve"; withdrawalId: number }
  | { kind: "reject"; withdrawalId: number }
  | { kind: "paid"; withdrawalId: number };

type Input = "none" | "note" | "reason" | "ref";

type Meta = {
  label: string;
  title: string;
  text?: string;
  input: Input;
  confirm: boolean;
  tone: "neutral" | "primary" | "danger";
};

function meta(spec: AdminActionSpec): Meta {
  switch (spec.kind) {
    case "dismiss":
      return { label: "ยกฟ้อง", title: "ยกฟ้องรายงาน", text: "ไม่พบการละเมิด ปิดรายงานโดยไม่ทำอะไรกับเนื้อหา", input: "note", confirm: true, tone: "neutral" };
    case "resolve":
      return { label: "ปิดว่าจัดการแล้ว", title: "ปิดรายงาน (จัดการแล้ว)", text: "ใช้เมื่อจัดการเรื่องนี้ไปแล้วด้วยวิธีอื่น", input: "note", confirm: true, tone: "neutral" };
    case "hide":
      return spec.hidden
        ? { label: "ซ่อน", title: "ซ่อนเนื้อหานี้", text: "ผู้อ่านจะไม่เห็นอีก รายงานที่เปิดอยู่ของรายการนี้จะถูกปิดว่าจัดการแล้ว", input: "note", confirm: true, tone: "primary" }
        : { label: "เลิกซ่อน", title: "", input: "none", confirm: false, tone: "neutral" };
    case "hold":
      return { label: "ปิดตรวจสอบ", title: "ปิดเรื่องนี้ชั่วคราวเพื่อตรวจสอบ", text: "ผู้อ่านเข้าไม่ได้ระหว่างปิด เมื่อเปิดคืนผู้อ่านได้เวลาอ่านชดเชย และ uploader ต้องรอถอนนานขึ้นเท่ากัน — แจ้งเหตุผลให้ uploader", input: "reason", confirm: true, tone: "primary" };
    case "release":
      return { label: "เปิดคืน", title: "เปิดเรื่องนี้ให้อ่านตามปกติ", text: "ชดเชยเวลาอ่านให้ผู้ที่ซื้อตอนไว้เท่ากับช่วงที่ปิด", input: "none", confirm: true, tone: "primary" };
    case "takedown":
      return { label: "ถอดเรื่อง", title: "ถอดเรื่องนี้ถาวร", text: "เรื่องหายจากเว็บ คืน coin ให้ผู้ที่ซื้อตอนและยังไม่หมดอายุ และคืนการสนับสนุนที่ยังไม่ครบ 30 วัน — ย้อนกลับไม่ได้", input: "reason", confirm: true, tone: "danger" };
    case "suspend":
      return { label: "ระงับชั่วคราว", title: "ระงับบัญชีชั่วคราว", text: "ใช้งานไม่ได้ (ซื้อตอน, คอมเมนต์, อัพโหลด, ถอนเงิน) แต่ coin และรายได้ยังอยู่", input: "reason", confirm: true, tone: "primary" };
    case "ban":
      return { label: "แบน", title: "แบนบัญชีถาวร", text: "ยึด coin ทั้งหมด ถอดทุกเรื่อง คืน coin ผู้อ่านส่วนที่ยังไม่ครบ 30 วัน ยึดรายได้ที่ค้างและคำขอถอน และ login ไม่ได้ — ปลดแบนแล้วก็ไม่คืน", input: "reason", confirm: true, tone: "danger" };
    case "lift":
      return { label: "ปลด", title: "ปลดบทลงโทษนี้", text: "ปลดแบนไม่คืน coin / เรื่องที่ถูกยึด", input: "none", confirm: true, tone: "primary" };
    case "verify":
      return spec.verified
        ? { label: "ให้ badge ยืนยันตัวตน", title: "ให้ verified badge", text: "สำหรับผู้เขียน/สำนักพิมพ์ที่ตรวจสอบลิขสิทธิ์แล้ว", input: "none", confirm: true, tone: "primary" }
        : { label: "ถอน badge", title: "ถอน verified badge", input: "none", confirm: true, tone: "neutral" };
    case "approve":
      return { label: "อนุมัติ", title: "อนุมัติคำขอถอน", text: "หลังอนุมัติให้โอนเงินผ่านพร้อมเพย์ แล้วกด “บันทึกว่าโอนแล้ว”", input: "none", confirm: true, tone: "primary" };
    case "reject":
      return { label: "ไม่อนุมัติ", title: "ไม่อนุมัติคำขอถอน", text: "ยอดจะกลับไปเป็นยอดที่ถอนได้ของ uploader เหตุผลจะแจ้งให้ uploader เห็น", input: "reason", confirm: true, tone: "danger" };
    case "paid":
      return { label: "บันทึกว่าโอนแล้ว", title: "บันทึกการโอนเงิน", text: "กรอกเลขอ้างอิงจากสลิปการโอน", input: "ref", confirm: true, tone: "primary" };
  }
}

type Result = { ok: true } | { ok: false; message: string };

function run(spec: AdminActionSpec, text: string, days: number | null): Promise<Result> {
  switch (spec.kind) {
    case "dismiss":
      return dismissReports(spec.reportIds, text);
    case "resolve":
      return resolveReports(spec.reportIds, text);
    case "hide":
      return setHidden(spec.targetType, spec.targetId, spec.hidden, text);
    case "hold":
      return holdSeries(spec.seriesId, text, spec.reportIds);
    case "release":
      return releaseSeries(spec.seriesId);
    case "takedown":
      return takeDownSeries(spec.seriesId, text, spec.reportIds);
    case "suspend":
      return suspendAccount(spec.userId, text, days, spec.reportIds);
    case "ban":
      return banAccount(spec.userId, text, spec.reportIds);
    case "lift":
      return liftAccountSanction(spec.sanctionId);
    case "verify":
      return setVerified(spec.userId, spec.verified);
    case "approve":
      return approveWithdrawal(spec.withdrawalId);
    case "reject":
      return rejectWithdrawal(spec.withdrawalId, text);
    case "paid":
      return markPaid(spec.withdrawalId, text);
  }
}

const BUTTON_TONE = {
  neutral: SECONDARY_BUTTON,
  primary: "h-10 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60",
  danger: "h-10 rounded-full bg-hot/15 px-5 text-sm font-semibold text-hot transition-colors hover:bg-hot/25 disabled:opacity-60",
};

const SUSPEND_DAYS = [
  { value: "1", label: "1 วัน" },
  { value: "3", label: "3 วัน" },
  { value: "7", label: "7 วัน" },
  { value: "30", label: "30 วัน" },
  { value: "", label: "จนกว่าจะปลด" },
];

export function AdminAction({ spec, label }: { spec: AdminActionSpec; label?: string }) {
  const m = meta(spec);
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await run(spec, text, days ? Number(days) : null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      ref.current?.close();
      setText("");
      router.refresh();
    });
  };

  const needsText = m.input === "reason" || m.input === "ref";
  const danger = m.tone === "danger";

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => (m.confirm ? (setError(null), ref.current?.showModal()) : submit())}
        className={BUTTON_TONE[m.tone]}
      >
        {pending && !m.confirm ? "กำลังทำ…" : (label ?? m.label)}
      </button>
      {!m.confirm && error && (
        <span role="alert" className="text-xs text-hot">
          {error}
        </span>
      )}
      {m.confirm && (
        <dialog
          ref={ref}
          aria-labelledby={`${id}-title`}
          className="m-auto w-[min(480px,calc(100vw-32px))] rounded-[20px] bg-surface p-6 text-text backdrop:bg-black/70"
        >
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <h2 id={`${id}-title`} className="text-lg font-bold leading-[1.4]">
              {m.title}
            </h2>
            {m.text && <p className="text-sm leading-[1.5] text-text-2">{m.text}</p>}
            {spec.kind === "suspend" && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-2">
                ระยะเวลา
                <select value={days} onChange={(e) => setDays(e.target.value)} className={INPUT}>
                  {SUSPEND_DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {m.input !== "none" && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-2">
                {m.input === "ref" ? "เลขอ้างอิงการโอน" : m.input === "reason" ? "เหตุผล" : "หมายเหตุ (ไม่บังคับ)"}
                {m.input === "ref" ? (
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                    maxLength={100}
                    autoComplete="off"
                    className={INPUT}
                  />
                ) : (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required={needsText}
                    maxLength={500}
                    rows={3}
                    className={TEXTAREA}
                  />
                )}
              </label>
            )}
            {error && (
              <p role="alert" className={ERROR_BOX}>
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => ref.current?.close()} className={SECONDARY_BUTTON}>
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={pending || (needsText && !text.trim())}
                className={
                  danger
                    ? "h-10 rounded-full bg-hot px-5 text-sm font-semibold text-white transition-colors hover:bg-hot/85 disabled:opacity-50"
                    : BUTTON_TONE.primary
                }
              >
                {pending ? "กำลังทำ…" : (label ?? m.label)}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
