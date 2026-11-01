import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PackList } from "@/components/coins/pack-list";
import { RefreshWhilePending } from "@/components/coins/refresh-while-pending";
import { formatDate } from "@/components/format";
import { CheckIcon, CloseIcon, CoinIcon } from "@/components/icons";
import { Section, SectionSkeleton } from "@/components/section";
import { TopBar } from "@/components/top-bar";
import { getUserId } from "@/lib/server/auth";
import {
  getCoinHistory,
  getCoinPacks,
  getPurchaseBySession,
  getWallet,
  type LedgerEntry,
} from "@/lib/server/coins";

// Coin top-up: balance, packs (Stripe Checkout, PromptPay), recent history.
// After Checkout, Stripe sends the buyer back here with ?checkout=…; the
// banner only reports the status — coins are credited by the webhook.

export const metadata: Metadata = {
  title: "เติม coin — Toon Universe",
  robots: { index: false },
};

export default function CoinsPage({ searchParams }: PageProps<"/coins">) {
  return (
    <>
      <TopBar />
      <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-8 px-4 pb-24 pt-4 lg:gap-12 lg:px-12 lg:pb-[139px] lg:pt-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-[22px] font-bold leading-[1.4] lg:text-[28px]">เติม coin</h1>
          <Suspense fallback={null}>
            <CheckoutBanner searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton className="h-[112px] rounded-[20px]" />}>
            <Balance />
          </Suspense>
        </div>

        <Section title="เลือกแพ็ก">
          <Suspense fallback={<SectionSkeleton className="h-[296px] rounded-[20px] sm:h-[196px] lg:h-[212px]" />}>
            <Packs />
          </Suspense>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-[1.5] text-muted lg:text-sm">
            <li>ชำระผ่าน PromptPay (สแกน QR ด้วยแอปธนาคาร) — ราคารวม VAT แล้ว</li>
            <li>coin ที่เติมไม่มีวันหมดอายุ ใช้ปลดล็อกตอน (อ่านได้ 30 วัน) และสนับสนุนผู้เขียน</li>
            <li>
              ไม่คืนเงินค่าเติม coin ทุกกรณี ตาม{" "}
              <Link href="/terms" className="text-text-2 underline underline-offset-2 hover:text-text">
                ข้อกำหนดการใช้งาน
              </Link>
            </li>
          </ul>
        </Section>

        <Suspense fallback={null}>
          <History />
        </Suspense>
      </main>
      <BottomTabBar active="" />
    </>
  );
}

async function Packs() {
  const [packs, userId] = await Promise.all([getCoinPacks(), getUserId()]);
  if (packs.length === 0) {
    return <p className="rounded-[20px] bg-surface p-6 text-center text-sm text-muted">ยังไม่มีแพ็กให้เลือกในขณะนี้</p>;
  }
  return <PackList packs={packs} signedIn={userId != null} />;
}

async function Balance() {
  const wallet = await getWallet();
  if (!wallet) return null;
  const total = wallet.purchased + wallet.welcome;
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm leading-[1.4] text-muted">coin ของคุณ</p>
        <p className="flex items-center gap-2 text-[28px] font-bold leading-none text-gold lg:text-[32px]">
          <CoinIcon className="size-7 lg:size-8" />
          {total.toLocaleString("th-TH")}
        </p>
      </div>
      <dl className="flex gap-6 text-sm leading-[1.4]">
        <div>
          <dt className="text-muted">coin ที่เติม</dt>
          <dd className="font-semibold">{wallet.purchased.toLocaleString("th-TH")}</dd>
        </div>
        <div>
          <dt className="text-muted">welcome coin</dt>
          <dd className="font-semibold">
            {wallet.welcome.toLocaleString("th-TH")}
            {wallet.welcomeExpiresAt && (
              <span className="ml-1.5 text-xs font-normal text-muted">
                หมดอายุ {formatDate(wallet.welcomeExpiresAt)}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

async function CheckoutBanner({ searchParams }: Pick<PageProps<"/coins">, "searchParams">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const checkout = first(params.checkout);

  if (checkout === "canceled") {
    return <Banner tone="muted" icon={<CloseIcon size={18} />} text="ยกเลิกการชำระเงินแล้ว ยังไม่มีการตัดเงิน" />;
  }
  if (checkout !== "success") return null;

  const sessionId = first(params.session_id);
  const purchase = sessionId ? await getPurchaseBySession(sessionId) : null;
  if (!purchase) return null;

  switch (purchase.status) {
    case "succeeded":
      return (
        <Banner
          tone="free"
          icon={<CheckIcon size={18} />}
          text={`เติม ${purchase.coins.toLocaleString("th-TH")} coin สำเร็จ`}
        />
      );
    case "pending":
      return (
        <>
          <RefreshWhilePending />
          <Banner
            tone="gold"
            icon={<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            text="กำลังยืนยันการชำระเงิน… coin จะเข้าบัญชีอัตโนมัติภายในไม่กี่วินาที"
          />
        </>
      );
    default:
      return <Banner tone="hot" icon={<CloseIcon size={18} />} text="การชำระเงินไม่สำเร็จหรือหมดเวลา กรุณาลองใหม่อีกครั้ง" />;
  }
}

const TONES = {
  free: "bg-free/10 text-free",
  gold: "bg-gold/10 text-gold",
  hot: "bg-hot/10 text-hot",
  muted: "bg-surface text-text-2",
} as const;

function Banner({ tone, icon, text }: { tone: keyof typeof TONES; icon: React.ReactNode; text: string }) {
  return (
    <p role="status" className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm leading-[1.4] ${TONES[tone]}`}>
      <span className="shrink-0">{icon}</span>
      {text}
    </p>
  );
}

const REASON_LABEL: Record<LedgerEntry["reason"], string> = {
  purchase: "เติม coin",
  welcome_grant: "welcome coin",
  welcome_expire: "welcome coin หมดอายุ",
  unlock: "ปลดล็อกตอน",
  donation: "สนับสนุนผู้เขียน",
  refund: "คืน coin",
  ban_forfeit: "ยึด coin (บัญชีถูกแบน)",
  admin_adjust: "ปรับยอดโดยผู้ดูแล",
};

async function History() {
  const items = await getCoinHistory();
  if (items.length === 0) return null;
  return (
    <Section title="ประวัติ coin">
      <ul className="divide-y divide-line rounded-[20px] bg-surface px-4 lg:px-6">
        {items.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[15px] leading-[1.4]">{REASON_LABEL[e.reason]}</p>
              <p className="text-xs leading-[1.4] text-muted">
                {formatDate(e.createdAt)}
                {e.kind === "welcome" && e.reason !== "welcome_grant" && e.reason !== "welcome_expire" && " · welcome coin"}
              </p>
            </div>
            <p className={`shrink-0 text-[15px] font-semibold ${e.delta > 0 ? "text-free" : "text-text-2"}`}>
              {e.delta > 0 ? "+" : "−"}
              {Math.abs(e.delta).toLocaleString("th-TH")}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
