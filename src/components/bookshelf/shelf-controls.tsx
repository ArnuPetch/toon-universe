"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBookshelfStatus, setFollowing } from "@/app/actions/bookshelf";
import type { BookshelfStatus } from "@/lib/server/series";
import { SHELF_LABEL } from "../format";
import { HeartIcon, SettingsIcon } from "../icons";

const iconBtn =
  "relative grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-text-2 transition-colors hover:bg-white/15 hover:text-text disabled:opacity-50";

/** Move a series to another shelf or take it off (then re-render the page). */
export function ShelfMenu({ seriesId, title, status }: { seriesId: number; title: string; status: BookshelfStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const change = (value: string) => {
    const next = value === "remove" ? null : (value as BookshelfStatus);
    setError(false);
    startTransition(async () => {
      const r = await setBookshelfStatus(seriesId, next);
      if (r.ok) router.refresh();
      else setError(true);
    });
  };

  return (
    <label className={iconBtn} title={error ? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" : "ย้ายชั้น"}>
      <SettingsIcon size={18} className={error ? "text-hot" : undefined} />
      <select
        aria-label={`ย้ายชั้นของ ${title}`}
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {(Object.keys(SHELF_LABEL) as BookshelfStatus[]).map((s) => (
          <option key={s} value={s}>
            {SHELF_LABEL[s]}
          </option>
        ))}
        <option value="remove">นำออกจากชั้น</option>
      </select>
    </label>
  );
}

export function UnfollowButton({ seriesId, title }: { seriesId: number; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`เลิกติดตาม ${title}`}
      title={error ? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" : "เลิกติดตาม"}
      onClick={() => {
        setError(false);
        startTransition(async () => {
          const r = await setFollowing(seriesId, false);
          if (r.ok) router.refresh();
          else setError(true);
        });
      }}
      className={`${iconBtn} text-hot`}
    >
      <HeartIcon size={18} filled />
    </button>
  );
}
