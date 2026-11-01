"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { deleteEpisode, saveEpisode } from "@/app/actions/studio";
import { ERROR_BOX, INPUT, LABEL, PRIMARY_BUTTON } from "../form-styles";
import { FormStatus } from "./series-form";

export type EpisodeFormValues = {
  id?: number;
  number: number;
  title: string;
  seasonId: number | null;
  price: number;
  state: "draft" | "scheduled" | "released";
  /** datetime-local value in Thai time (scheduled episodes). */
  publishAtLocal: string;
  /** Already formatted release time (released episodes). */
  releasedAtLabel?: string;
  pageCount: number;
};

const PUBLISH_OPTIONS = [
  { value: "draft", label: "ฉบับร่าง", hint: "ยังไม่เผยแพร่" },
  { value: "now", label: "เผยแพร่ทันที", hint: "ผู้ติดตามได้รับแจ้งเตือน" },
  { value: "schedule", label: "ตั้งเวลา", hint: "ปล่อยอัตโนมัติตามเวลา (เวลาไทย)" },
] as const;

export function EpisodeForm({
  seriesId,
  values,
  seasons,
  priceLockedUntilLabel,
  minLocal,
}: {
  seriesId: number;
  values: EpisodeFormValues;
  seasons: { id: number; number: number; title: string | null }[];
  priceLockedUntilLabel: string | null;
  /** Earliest schedulable time (now, Thai time) for the datetime input. */
  minLocal: string;
}) {
  const [state, action, pending] = useActionState(saveEpisode, {});
  const initialPublish = values.state === "scheduled" ? "schedule" : "draft";
  const [publish, setPublish] = useState<string>(initialPublish);
  const id = useId();
  const released = values.state === "released";
  const isNew = values.id === undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="series_id" value={seriesId} />
      {values.id !== undefined && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-number`} className={LABEL}>
            ตอนที่ <span className="text-hot">*</span>
          </label>
          <input
            id={`${id}-number`}
            name="number"
            type="number"
            required
            min={1}
            max={100000}
            defaultValue={values.number}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className={LABEL}>
            ชื่อตอน
          </label>
          <input
            id={`${id}-title`}
            name="title"
            maxLength={200}
            defaultValue={values.title}
            placeholder={`ตอนที่ ${values.number}`}
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-season`} className={LABEL}>
            Season
          </label>
          <select id={`${id}-season`} name="season_id" defaultValue={values.seasonId ?? ""} className={INPUT}>
            <option value="">ไม่ระบุ</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                Season {s.number}
                {s.title ? ` · ${s.title}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-price`} className={LABEL}>
            ราคา (coin)
          </label>
          <input
            id={`${id}-price`}
            name="price"
            type="number"
            required
            min={0}
            max={1000}
            defaultValue={values.price}
            readOnly={priceLockedUntilLabel != null}
            aria-describedby={`${id}-price-hint`}
            className={`${INPUT} read-only:opacity-60`}
          />
          <p id={`${id}-price-hint`} className="text-xs leading-[1.5] text-muted">
            {priceLockedUntilLabel
              ? `เพิ่งเปลี่ยนราคาไป เปลี่ยนได้อีกครั้งหลัง ${priceLockedUntilLabel}`
              : "0 = อ่านฟรี · หลังเผยแพร่เปลี่ยนราคาได้เดือนละ 1 ครั้ง ราคาใหม่ไม่กระทบคนที่ซื้อแล้ว"}
          </p>
        </div>
      </div>

      {released ? (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>การเผยแพร่</span>
          <p className="text-[15px] leading-[1.5]">
            เผยแพร่แล้ว{values.releasedAtLabel ? ` เมื่อ ${values.releasedAtLabel}` : ""}
            <span className="block text-xs text-muted">ตอนที่เผยแพร่แล้วเปลี่ยนเวลาหรือกลับเป็นฉบับร่างไม่ได้</span>
          </p>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className={`${LABEL} mb-1.5`}>การเผยแพร่</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PUBLISH_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer flex-col gap-0.5 rounded-xl bg-surface-2 px-4 py-3 leading-[1.4] transition-colors hover:bg-white/12 has-checked:bg-primary/20 has-checked:ring-2 has-checked:ring-primary has-focus-visible:ring-2 has-focus-visible:ring-primary/60"
              >
                <input
                  type="radio"
                  name="publish"
                  value={o.value}
                  checked={publish === o.value}
                  onChange={() => setPublish(o.value)}
                  className="sr-only"
                />
                <span className="text-[15px] font-semibold">{o.label}</span>
                <span className="text-xs text-muted">{o.hint}</span>
              </label>
            ))}
          </div>
          {publish === "schedule" && (
            <div className="flex flex-col gap-1.5 pt-1">
              <label htmlFor={`${id}-at`} className={LABEL}>
                วันและเวลาเผยแพร่ (เวลาไทย)
              </label>
              <input
                id={`${id}-at`}
                name="publish_at"
                type="datetime-local"
                required
                min={minLocal}
                defaultValue={values.publishAtLocal}
                className={`${INPUT} w-auto min-w-[240px]`}
              />
            </div>
          )}
          {publish !== "draft" && values.pageCount === 0 && (
            <p className="text-xs leading-[1.5] text-gold">
              {isNew ? "สร้างตอนก่อน แล้วอัพโหลดหน้า จึงจะเผยแพร่ได้" : "ต้องอัพโหลดหน้าของตอนก่อนเผยแพร่"}
            </p>
          )}
        </fieldset>
      )}

      <FormStatus id={`${id}-error`} state={state} />
      <div>
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "กำลังบันทึก…" : isNew ? "สร้างตอน แล้วไปอัพโหลดหน้า" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}

export function DeleteEpisodeButton({
  seriesId,
  episodeId,
  released,
}: {
  seriesId: number;
  episodeId: number;
  released: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-[1.5] text-muted">
        {released
          ? "ตอนนี้เผยแพร่แล้ว — ลบแล้วผู้อ่านที่ซื้อไว้และยังไม่หมดอายุจะได้ coin คืน (หักจากรายได้ที่ยังรอถอน)"
          : "ตอนนี้ยังไม่เผยแพร่ ลบได้ทันที"}
      </p>
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(released ? "ลบตอนนี้และคืน coin ให้ผู้ซื้อ? กู้คืนไม่ได้" : "ลบตอนนี้?")) return;
            setError(null);
            start(async () => {
              const r = await deleteEpisode(seriesId, episodeId);
              if (r && !r.ok) setError(r.message);
            });
          }}
          className="h-10 rounded-full bg-hot/15 px-5 text-sm font-semibold text-hot transition-colors hover:bg-hot/25 disabled:opacity-60"
        >
          {pending ? "กำลังลบ…" : "ลบตอนนี้"}
        </button>
      </div>
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </div>
  );
}
