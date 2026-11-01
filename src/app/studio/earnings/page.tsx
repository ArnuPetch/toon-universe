import type { Metadata } from "next";
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import {
  EARNING_SOURCE_LABEL,
  EARNING_STATUS_LABEL,
  formatDate,
  formatDateTime,
  formatNumber,
  WITHDRAWAL_STATUS_LABEL,
} from "@/components/format";
import { PageMain, PageTitle, SignInPrompt } from "@/components/page";
import { Section, SectionSkeleton } from "@/components/section";
import { CARD, Pill, StatTile, StudioNav, WITHDRAWAL_TONE } from "@/components/studio/bits";
import { PayoutForm, WithdrawButton } from "@/components/studio/earnings-forms";
import { TopBar } from "@/components/top-bar";
import { getEarnings } from "@/lib/server/studio";

// Uploader earnings: balances, payout account (PromptPay), withdraw, history.
// Rules (docs/coin-and-revenue.md): 1 coin = 1 THB, withdrawable 30 days after
// the unlock/donation, minimum 100, all-at-once, admin approves + transfers.

export const metadata: Metadata = {
  title: "รายได้ — Toon Universe",
  robots: { index: false },
};

const MIN_WITHDRAWAL = 100;

export default function EarningsPage() {
  return (
    <>
      <TopBar />
      <PageMain>
        <PageTitle sub="1 coin ที่ผู้อ่านใช้ = 1 บาท · ถอนได้เมื่อครบ 30 วัน ขั้นต่ำ 100 บาท">รายได้ & ถอนเงิน</PageTitle>
        <StudioNav current="/studio/earnings" />
        <Suspense
          fallback={
            <>
              <SectionSkeleton className="h-[104px] rounded-[20px]" />
              <SectionSkeleton className="h-[360px] rounded-[20px]" />
            </>
          }
        >
          <EarningsContent />
        </Suspense>
      </PageMain>
      <BottomTabBar active="/profile" />
    </>
  );
}

async function EarningsContent() {
  const data = await getEarnings();
  if (!data) return <SignInPrompt next="/studio/earnings" text="เข้าสู่ระบบเพื่อดูรายได้ของคุณ" />;
  const { balance, payout } = data;

  const disabledReason =
    data.accountStatus !== "active"
      ? "บัญชีถูกระงับ ถอนเงินไม่ได้ในขณะนี้"
      : !payout
        ? "เพิ่มบัญชีรับเงินด้านล่างก่อน"
        : balance.withdrawable < MIN_WITHDRAWAL
          ? `ถอนได้เมื่อยอดถึง ${MIN_WITHDRAWAL} บาท`
          : null;

  return (
    <>
      <section aria-label="ยอดเงิน" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <StatTile label="ถอนได้ตอนนี้" value={`${formatNumber(balance.withdrawable)} ฿`} accent />
        <StatTile
          label="รอครบ 30 วัน"
          value={`${formatNumber(balance.waiting)} ฿`}
          sub={balance.nextAvailableAt ? `ก้อนถัดไปถอนได้ ${formatDate(balance.nextAvailableAt)}` : undefined}
        />
        <StatTile label="กำลังดำเนินการถอน" value={`${formatNumber(balance.processing)} ฿`} />
        <StatTile label="ได้รับแล้ว" value={`${formatNumber(balance.paid)} ฿`} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <Section title="บัญชีรับเงิน (พร้อมเพย์)">
          <div className={CARD}>
            {payout && (
              <p className="mb-4 text-sm leading-[1.5] text-text-2">
                ปัจจุบัน: <span className="font-semibold text-text">{payout.promptpayId}</span> · {payout.accountName}
              </p>
            )}
            <PayoutForm promptpayId={payout?.promptpayId ?? ""} accountName={payout?.accountName ?? ""} />
          </div>
        </Section>
        <Section title="ถอนเงิน">
          <div className={`${CARD} flex flex-col gap-3`}>
            <p className="text-sm leading-[1.5] text-muted">
              ถอนยอดที่ถอนได้ทั้งหมดในครั้งเดียว ทีมงานตรวจสอบแล้วโอนเข้าพร้อมเพย์ของคุณ รายได้จากเรื่องที่กำลังถูกปิดตรวจจะถอนได้หลังเปิดอีกครั้ง
            </p>
            <p className="text-2xl font-bold leading-[1.3] text-gold">{formatNumber(balance.withdrawable)} ฿</p>
            <WithdrawButton amount={balance.withdrawable} disabledReason={disabledReason} />
          </div>
        </Section>
      </div>

      <Section title="ประวัติการถอน">
        {data.withdrawals.length === 0 ? (
          <p className="rounded-[20px] bg-surface px-4 py-8 text-center text-sm text-muted">ยังไม่มีคำขอถอน</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-surface">
            {data.withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 lg:px-5">
                <span className="flex-1 text-[15px] font-semibold leading-[1.4]">{formatNumber(w.amount)} ฿</span>
                <Pill tone={WITHDRAWAL_TONE[w.status]}>{WITHDRAWAL_STATUS_LABEL[w.status]}</Pill>
                <span className="w-full text-xs leading-[1.5] text-muted lg:w-auto">
                  ขอเมื่อ {formatDateTime(w.requestedAt)} · พร้อมเพย์ {w.promptpayId}
                  {w.paidAt && ` · โอน ${formatDateTime(w.paidAt)}`}
                  {w.transferRef && ` · อ้างอิง ${w.transferRef}`}
                  {w.rejectReason && ` · เหตุผล: ${w.rejectReason === "account_banned" ? "บัญชีถูกแบน" : w.rejectReason}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="รายได้ล่าสุด">
        {data.earnings.length === 0 ? (
          <p className="rounded-[20px] bg-surface px-4 py-8 text-center text-sm text-muted">
            ยังไม่มีรายได้ — เมื่อผู้อ่านใช้ coin ที่เติมปลดล็อกตอนหรือสนับสนุนคุณ รายได้จะแสดงที่นี่
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-surface">
            {data.earnings.map((e) => (
              <li key={e.id} className="flex items-center gap-4 px-4 py-3 lg:px-5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-[15px] leading-[1.4]">
                    {EARNING_SOURCE_LABEL[e.source]}
                    {e.seriesTitle && <span className="text-text-2"> · {e.seriesTitle}</span>}
                  </p>
                  <p className="text-xs leading-[1.4] text-muted">
                    {formatDateTime(e.createdAt)}
                    {e.status === "pending" &&
                      (Date.parse(e.availableAt) > data.now
                        ? ` · ถอนได้ ${formatDate(e.availableAt)}`
                        : " · ถอนได้แล้ว")}
                  </p>
                </div>
                <Pill tone={e.status === "reversed" ? "hot" : e.status === "withdrawn" ? "neutral" : "gold"}>
                  {EARNING_STATUS_LABEL[e.status]}
                </Pill>
                <span className={`w-16 text-right text-[15px] font-semibold ${e.status === "reversed" ? "text-muted line-through" : "text-gold"}`}>
                  +{formatNumber(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
