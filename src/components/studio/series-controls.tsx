"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { deleteSeason, deleteSeries, saveSeason, setSeriesVisibility } from "@/app/actions/studio";
import { ERROR_BOX, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from "../form-styles";

// Client controls of the studio series page.

type Result = { ok: true } | { ok: false; message: string };

/** Run a server action; returns its error message (if any). */
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
      else after?.();
    });
  };
  return { pending, error, run, setError };
}

export function PublishToggle({
  seriesId,
  published,
  releasedEpisodes,
}: {
  seriesId: number;
  published: boolean;
  releasedEpisodes: number;
}) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setSeriesVisibility(seriesId, published ? "draft" : "published"))}
        className={published ? SECONDARY_BUTTON : PRIMARY_BUTTON}
      >
        {pending ? "กำลังบันทึก…" : published ? "ย้ายกลับเป็นฉบับร่าง" : "เผยแพร่เรื่องนี้"}
      </button>
      {!published && releasedEpisodes === 0 && (
        <p className="text-xs leading-[1.5] text-muted">ยังไม่มีตอนที่เผยแพร่ — ผู้อ่านจะเห็นหน้าเรื่องแต่ยังไม่มีตอนให้อ่าน</p>
      )}
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Confirm dialog: the uploader types the title to delete. */
export function DeleteSeriesButton({ seriesId, title }: { seriesId: number; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const { pending, error, run } = useAction();
  const id = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="h-10 rounded-full bg-hot/15 px-5 text-sm font-semibold text-hot transition-colors hover:bg-hot/25"
      >
        ลบเรื่องนี้
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[20px] bg-surface p-6 text-text backdrop:bg-black/70"
      >
        <div className="flex flex-col gap-4">
          <h2 id={`${id}-title`} className="text-lg font-bold leading-[1.4]">
            ลบ “{title}”?
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-[1.5] text-text-2">
            <li>เรื่องและทุกตอนจะหายจากเว็บทันที และกู้คืนไม่ได้</li>
            <li>ผู้อ่านที่ซื้อตอนและยังไม่หมดอายุจะได้ coin คืน 100% — หักจากรายได้ที่ยังรอถอนของคุณ</li>
            <li>การสนับสนุนในเรื่องนี้ที่ยังไม่ครบ 30 วันจะถูกคืนผู้ให้</li>
          </ul>
          <label htmlFor={`${id}-confirm`} className="text-sm leading-[1.4] text-muted">
            พิมพ์ชื่อเรื่องเพื่อยืนยัน
          </label>
          <input
            id={`${id}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={INPUT}
            autoComplete="off"
          />
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
              type="button"
              disabled={pending || typed.trim() !== title.trim()}
              onClick={() => run(() => deleteSeries(seriesId))}
              className="h-10 rounded-full bg-hot px-5 text-sm font-semibold text-white transition-colors hover:bg-hot/85 disabled:opacity-50"
            >
              {pending ? "กำลังลบ…" : "ลบถาวร"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export type SeasonRow = { id: number; number: number; title: string | null; episodes: number };

export function SeasonManager({ seriesId, seasons }: { seriesId: number; seasons: SeasonRow[] }) {
  const router = useRouter();
  const nextNumber = Math.max(0, ...seasons.map((s) => s.number)) + 1;
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const { pending, error, run, setError } = useAction();
  const id = useId();

  const open = (row: SeasonRow | null) => {
    setError(null);
    setEditing(row ? row.id : "new");
    setNumber(String(row ? row.number : nextNumber));
    setTitle(row?.title ?? "");
  };

  const save = () =>
    run(
      () => saveSeason(seriesId, editing === "new" ? null : (editing as number), Number(number), title),
      () => {
        setEditing(null);
        router.refresh();
      },
    );

  const form = (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor={`${id}-num`}>
        เลข season
      </label>
      <input
        id={`${id}-num`}
        type="number"
        min={1}
        max={999}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        className={`${INPUT} bg-surface sm:w-24`}
      />
      <label className="sr-only" htmlFor={`${id}-title`}>
        ชื่อ season
      </label>
      <input
        id={`${id}-title`}
        value={title}
        maxLength={200}
        placeholder="ชื่อ season (ไม่บังคับ)"
        onChange={(e) => setTitle(e.target.value)}
        className={`${INPUT} bg-surface`}
      />
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={pending} onClick={save} className={`${PRIMARY_BUTTON} h-10 text-sm`}>
          บันทึก
        </button>
        <button type="button" onClick={() => setEditing(null)} className={SECONDARY_BUTTON}>
          ยกเลิก
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {seasons.length === 0 && editing !== "new" && (
        <p className="text-sm leading-[1.5] text-muted">
          ไม่บังคับ — ใช้แบ่งตอนเป็นภาค เช่น Season 1, Season 2 (หน้าเรื่องจะแยกรายชื่อตอนตาม season)
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {seasons.map((s) => (
          <li key={s.id}>
            {editing === s.id ? (
              form
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <span className="flex-1 text-[15px] leading-[1.4]">
                  Season {s.number}
                  {s.title && <span className="text-text-2"> · {s.title}</span>}
                  <span className="ml-2 text-[13px] text-muted">{s.episodes} ตอน</span>
                </span>
                <button type="button" onClick={() => open(s)} className={TEXT_BUTTON}>
                  แก้ไข
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`ลบ Season ${s.number}? ตอนใน season นี้จะไม่ถูกลบ แค่ไม่มี season`)) {
                      run(() => deleteSeason(seriesId, s.id), () => router.refresh());
                    }
                  }}
                  className={`${TEXT_BUTTON} hover:text-hot`}
                >
                  ลบ
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        form
      ) : (
        <div>
          <button type="button" onClick={() => open(null)} className={SECONDARY_BUTTON}>
            + เพิ่ม season
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
    </div>
  );
}
