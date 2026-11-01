"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buyCoinPackAction } from "@/app/actions/coins";
import type { CoinPack } from "@/lib/server/coins";
import { CoinIcon } from "../icons";

const baht = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** Coin packs; buying sends the browser to Stripe Checkout (PromptPay). */
export function PackList({ packs, signedIn }: { packs: CoinPack[]; signedIn: boolean }) {
  const [pending, startTransition] = useTransition();
  const [buying, setBuying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const best = packs.reduce<CoinPack | null>((a, p) => (!a || p.perCoin < a.perCoin ? p : a), null);

  const buy = (packId: number) =>
    startTransition(async () => {
      setError(null);
      setBuying(packId);
      const r = await buyCoinPackAction(packId);
      if (r.ok) {
        // Keep the button busy while the browser leaves for Stripe.
        window.location.assign(r.data.checkoutUrl);
        return;
      }
      setBuying(null);
      setError(r.message);
    });

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-3 sm:grid-cols-3 lg:gap-5">
        {packs.map((p) => {
          const isBest = packs.length > 1 && p.id === best?.id;
          const busy = buying === p.id;
          return (
            <li
              key={p.id}
              className={`relative flex flex-row items-center gap-4 rounded-[20px] bg-surface p-4 sm:flex-col sm:items-stretch sm:gap-5 sm:p-6 ${
                isBest ? "ring-2 ring-primary" : ""
              }`}
            >
              {isBest && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold leading-[1.4] text-white sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                  คุ้มที่สุด
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:items-center sm:text-center">
                <p className="flex items-center gap-2 text-[22px] font-bold leading-none lg:text-[28px]">
                  <CoinIcon className="size-[22px] lg:size-7" />
                  {p.coins.toLocaleString("th-TH")}
                  <span className="text-sm font-semibold text-muted lg:text-base">coin</span>
                </p>
                <p className="text-[13px] leading-[1.4] text-muted">
                  {rate.format(p.perCoin)} บาท/coin
                  {p.saving && (
                    <span className="ml-1.5 font-semibold text-free">
                      ประหยัด {p.saving.percent}% ({baht.format(p.saving.baht)} บาท)
                    </span>
                  )}
                </p>
              </div>
              {signedIn ? (
                <button
                  type="button"
                  onClick={() => buy(p.id)}
                  disabled={pending}
                  aria-label={`ซื้อ ${p.coins} coin ราคา ${baht.format(p.priceSatang / 100)} บาท`}
                  className="flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60 sm:h-12 sm:text-base"
                >
                  {busy ? "กำลังไปหน้าชำระเงิน…" : `฿${baht.format(p.priceSatang / 100)}`}
                </button>
              ) : (
                <span className="shrink-0 text-lg font-bold sm:text-center sm:text-xl">
                  ฿{baht.format(p.priceSatang / 100)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!signedIn && (
        <Link
          href="/login?next=/coins"
          className="flex h-12 items-center justify-center self-center rounded-full bg-primary px-8 text-base font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          เข้าสู่ระบบเพื่อเติม coin
        </Link>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-hot">
          {error}
        </p>
      )}
    </div>
  );
}
