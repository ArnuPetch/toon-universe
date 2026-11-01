"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unlockEpisodeAction } from "@/app/actions/reader";
import { CoinIcon, LockIcon } from "../icons";

/** Paywall for a paid episode: unlock with coins (30 days of access). */
export function UnlockPanel({
  episodeId,
  episodeNumber,
  price,
  balance,
  loginHref,
}: {
  episodeId: number;
  episodeNumber: number;
  price: number;
  /** null = signed out. */
  balance: number | null;
  loginHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; needCoins: boolean } | null>(null);
  const short = balance != null && balance < price;

  const unlock = () =>
    startTransition(async () => {
      setError(null);
      const r = await unlockEpisodeAction(episodeId);
      if (r.ok) {
        router.refresh();
      } else {
        setError({ message: r.message, needCoins: r.code === "insufficient_coins" });
      }
    });

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-4 rounded-[20px] bg-surface p-6 text-center lg:p-8">
      <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
        <LockIcon size={26} />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold leading-[1.4] lg:text-[22px]">ปลดล็อกตอนที่ {episodeNumber}</h2>
        <p className="text-sm leading-[1.5] text-muted">ปลดล็อกแล้วอ่านได้ 30 วัน</p>
      </div>
      <p className="flex items-center gap-2 text-[28px] font-bold leading-none text-gold">
        <CoinIcon size={28} />
        {price}
        <span className="text-base font-semibold text-muted">coin</span>
      </p>

      {balance == null ? (
        <Link
          href={loginHref}
          className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          เข้าสู่ระบบเพื่อปลดล็อก
        </Link>
      ) : (
        <>
          <p className="text-sm text-text-2">
            coin ของคุณ: <span className="font-semibold text-text">{balance.toLocaleString("th-TH")}</span>
          </p>
          {short || error?.needCoins ? (
            <Link
              href="/coins"
              className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              coin ไม่พอ — เติม coin
            </Link>
          ) : (
            <button
              type="button"
              onClick={unlock}
              disabled={pending}
              className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? "กำลังปลดล็อก…" : `ปลดล็อก ${price} coin`}
            </button>
          )}
        </>
      )}
      {error && !error.needCoins && (
        <p role="alert" className="text-sm text-hot">
          {error.message}
        </p>
      )}
    </div>
  );
}
