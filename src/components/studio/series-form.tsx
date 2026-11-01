"use client";

import { useActionState, useId, useState } from "react";
import { saveSeries, type FormState } from "@/app/actions/studio";
import {
  AGE_RATING_LABEL,
  READING_DIRECTION_LABEL,
  READING_MODE_LABEL,
  SERIES_STATUS_LABEL,
} from "../format";
import { ERROR_BOX, INPUT, LABEL, PRIMARY_BUTTON, SUCCESS_BOX, TEXTAREA } from "../form-styles";

export type SeriesFormValues = {
  id?: number;
  title: string;
  slug: string;
  synopsis: string;
  ageRating: keyof typeof AGE_RATING_LABEL;
  status: keyof typeof SERIES_STATUS_LABEL;
  readingMode: keyof typeof READING_MODE_LABEL;
  readingDirection: keyof typeof READING_DIRECTION_LABEL;
  genreIds: number[];
};

const MAX_GENRES = 5;

export function FormStatus({ id, state }: { id: string; state: FormState }) {
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

/** Segmented radio row (age rating, status, reading mode…). */
export function RadioRow<T extends string>({
  name,
  legend,
  options,
  defaultValue,
  hint,
}: {
  name: string;
  legend: string;
  options: Record<T, string>;
  defaultValue: T;
  hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={`${LABEL} mb-1.5`}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((value) => (
          <label
            key={value}
            className="flex h-10 cursor-pointer items-center rounded-xl bg-surface-2 px-4 text-sm leading-[1.4] text-text-2 transition-colors hover:text-text has-checked:bg-primary has-checked:font-semibold has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-primary/60"
          >
            <input type="radio" name={name} value={value} defaultChecked={value === defaultValue} className="sr-only" />
            {options[value]}
          </label>
        ))}
      </div>
      {hint && <p className="text-xs leading-[1.5] text-muted">{hint}</p>}
    </fieldset>
  );
}

export function SeriesForm({
  values,
  genres,
}: {
  values: SeriesFormValues;
  genres: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveSeries, {});
  const [picked, setPicked] = useState<number[]>(values.genreIds);
  const id = useId();
  const isNew = values.id === undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      {values.id !== undefined && <input type="hidden" name="id" value={values.id} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className={LABEL}>
          ชื่อเรื่อง <span className="text-hot">*</span>
        </label>
        <input
          id={`${id}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={values.title}
          placeholder="ชื่อผลงาน"
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-slug`} className={LABEL}>
          ลิงก์เรื่อง
        </label>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted">/series/</span>
          <input
            id={`${id}-slug`}
            name="slug"
            maxLength={100}
            pattern="[a-z0-9\-]{1,100}"
            autoCapitalize="none"
            defaultValue={values.slug}
            placeholder={isNew ? "เว้นว่างให้ระบบตั้งให้" : ""}
            aria-describedby={`${id}-slug-hint`}
            className={INPUT}
          />
        </div>
        <p id={`${id}-slug-hint`} className="text-xs leading-[1.5] text-muted">
          a-z, 0-9 และ - เท่านั้น · เปลี่ยนแล้วลิงก์เดิมที่แชร์ไว้จะใช้ไม่ได้
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-synopsis`} className={LABEL}>
          เรื่องย่อ
        </label>
        <textarea
          id={`${id}-synopsis`}
          name="synopsis"
          maxLength={5000}
          rows={5}
          defaultValue={values.synopsis}
          placeholder="เล่าเรื่องย่อให้ผู้อ่านอยากเปิดอ่าน"
          className={TEXTAREA}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={`${LABEL} mb-1.5`}>
          แนว <span className="text-hot">*</span>{" "}
          <span className="font-normal text-muted">
            (เลือกได้ {MAX_GENRES} แนว · เลือกแล้ว {picked.length})
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => {
            const checked = picked.includes(g.id);
            return (
              <label
                key={g.id}
                className={`flex h-9 cursor-pointer items-center rounded-xl px-3 text-[13px] leading-[1.4] transition-colors has-focus-visible:ring-2 has-focus-visible:ring-primary/60 lg:text-sm ${
                  checked ? "bg-primary font-semibold text-white" : "bg-white/12 text-tag hover:bg-white/20"
                } ${!checked && picked.length >= MAX_GENRES ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  name="genres"
                  value={g.id}
                  checked={checked}
                  disabled={!checked && picked.length >= MAX_GENRES}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id)))
                  }
                  className="sr-only"
                />
                {g.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
        <RadioRow
          name="age_rating"
          legend="เรตอายุ"
          options={AGE_RATING_LABEL}
          defaultValue={values.ageRating}
          hint="13+ / 18+ ผู้อ่านต้องกรอกวันเกิดและอายุถึงจึงจะอ่านได้"
        />
        <RadioRow name="status" legend="สถานะเรื่อง" options={SERIES_STATUS_LABEL} defaultValue={values.status} />
        <RadioRow
          name="reading_mode"
          legend="โหมดอ่านเริ่มต้น"
          options={READING_MODE_LABEL}
          defaultValue={values.readingMode}
        />
        <RadioRow
          name="reading_direction"
          legend="ทิศทางพลิกหน้า"
          options={READING_DIRECTION_LABEL}
          defaultValue={values.readingDirection}
          hint="manga ญี่ปุ่นส่วนใหญ่อ่านขวา → ซ้าย"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>ปก</span>
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm leading-[1.5] text-muted">
          อัพโหลดปกได้เร็วๆ นี้ (รอเชื่อมที่เก็บรูป) — ระหว่างนี้ใช้ปกสีอัตโนมัติ
        </p>
      </div>

      <FormStatus id={`${id}-error`} state={state} />
      <div>
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "กำลังบันทึก…" : isNew ? "สร้างเรื่อง (ฉบับร่าง)" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}
