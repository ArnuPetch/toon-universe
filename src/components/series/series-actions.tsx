"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setBookshelfStatus, setFollowing } from "@/app/actions/bookshelf";
import type { BookshelfStatus } from "@/lib/server/series";
import { HeartIcon, ShelfIcon } from "../icons";

const SHELF_LABEL: Record<BookshelfStatus, string> = {
  reading: "กำลังอ่าน",
  completed: "อ่านจบแล้ว",
  plan_to_read: "อยากอ่าน",
};

const pill =
  "flex h-[42px] items-center gap-2 rounded-full px-[18px] text-sm font-semibold transition-colors lg:h-12 lg:px-6 lg:text-base";

/** Follow + bookshelf buttons. Signed out → both lead to the login page. */
export function SeriesActions({
  seriesId,
  signedIn,
  loginHref,
  initialFollowing,
  initialShelf,
}: {
  seriesId: number;
  signedIn: boolean;
  loginHref: string;
  initialFollowing: boolean;
  initialShelf: BookshelfStatus | null;
}) {
  const [following, setFollowingState] = useState(initialFollowing);
  const [shelf, setShelf] = useState(initialShelf);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (!signedIn) {
    return (
      <>
        <Link href={loginHref} className={`${pill} bg-white/12 text-text hover:bg-white/20`}>
          <HeartIcon size={18} />
          ติดตาม
        </Link>
        <Link href={loginHref} className={`${pill} bg-white/12 text-text hover:bg-white/20`}>
          <ShelfIcon size={18} />
          ชั้นหนังสือ
        </Link>
      </>
    );
  }

  const toggleFollow = () => {
    const next = !following;
    setFollowingState(next);
    setError(false);
    startTransition(async () => {
      const r = await setFollowing(seriesId, next);
      if (!r.ok) {
        setFollowingState(!next);
        setError(true);
      }
    });
  };

  const changeShelf = (value: string) => {
    const next = value === "" ? null : (value as BookshelfStatus);
    const prev = shelf;
    setShelf(next);
    setError(false);
    startTransition(async () => {
      const r = await setBookshelfStatus(seriesId, next);
      if (!r.ok) {
        setShelf(prev);
        setError(true);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleFollow}
        disabled={pending}
        aria-pressed={following}
        className={`${pill} ${
          following ? "bg-hot/15 text-hot hover:bg-hot/25" : "bg-white/12 text-text hover:bg-white/20"
        }`}
      >
        <HeartIcon size={18} filled={following} />
        {following ? "ติดตามแล้ว" : "ติดตาม"}
      </button>
      <label className={`${pill} relative cursor-pointer bg-white/12 text-text hover:bg-white/20`}>
        <ShelfIcon size={18} className={shelf ? "text-primary" : undefined} />
        <span>{shelf ? SHELF_LABEL[shelf] : "ชั้นหนังสือ"}</span>
        <select
          aria-label="ชั้นหนังสือ"
          value={shelf ?? ""}
          disabled={pending}
          onChange={(e) => changeShelf(e.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          <option value="">{shelf ? "นำออกจากชั้น" : "ไม่อยู่ในชั้น"}</option>
          {(Object.keys(SHELF_LABEL) as BookshelfStatus[]).map((s) => (
            <option key={s} value={s}>
              {SHELF_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="w-full text-sm text-hot">
          บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
        </p>
      )}
    </>
  );
}
